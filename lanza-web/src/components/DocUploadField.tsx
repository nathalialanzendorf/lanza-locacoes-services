import { useRef, useState } from "react";

import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { ocrDocumentoNoNavegador } from "@/lib/documentoOcrClient";

export type DocUploadTipo = "cnh" | "comprovante-residencia" | "crlv";

type DocUploadFieldProps = {
  label: string;
  tipo: DocUploadTipo;
  accept?: string;
  hint?: string;
  disabled?: boolean;
  onParsed: (data: { campos: Record<string, unknown>; avisos: string[] }) => void;
  onError?: (message: string) => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const base64 = raw.includes(",") ? raw.split(",")[1]! : raw;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function isImagem(nomeArquivo: string): boolean {
  return /\.(jpe?g|png|webp|jfif)$/i.test(nomeArquivo);
}

function deveTentarOcrLocal(tipo: DocUploadTipo): boolean {
  return tipo === "cnh" || tipo === "comprovante-residencia";
}

function isNomeCnhValido(nome: string): boolean {
  const t = nome.trim();
  if (t.length < 8) return false;
  const u = t.toUpperCase();
  if (u === "E SOBRENOME" || u === "SOBRENOME" || /\bSOBRENOME$/i.test(u)) return false;
  if (/^(NOME|E)\b|HABILIT|CNH|BRASIL|MINIST|CARTEIRA|SECRETARIA|TRANSPORTE/i.test(u)) return false;
  return t.split(/\s+/).filter(Boolean).length >= 2;
}

function camposDocumentoOk(tipo: DocUploadTipo, campos: Record<string, unknown>): boolean {
  if (tipo === "cnh") {
    const cpfOk = typeof campos.cpf === "string" && campos.cpf.replace(/\D/g, "").length === 11;
    const cnh = campos.cnh as Record<string, unknown> | undefined;
    const reg = cnh?.numeroRegistro;
    const regOk = typeof reg === "string" && reg.replace(/\D/g, "").length >= 9;
    const nome = typeof campos.nome === "string" ? campos.nome.trim() : "";
    const nomeOk = nome.length > 0 && isNomeCnhValido(nome);
    if (!cpfOk || !regOk || !nomeOk) return false;
    return true;
  }
  if (tipo === "comprovante-residencia") {
    const e = campos.endereco as Record<string, unknown> | undefined;
    if (!e) return false;
    const bairro = String(e.bairro ?? "");
    const cidade = String(e.cidade ?? "");
    if (/pix|\.com|vencimento|cobran/i.test(bairro)) return false;
    if (/^\d{5}-?\d{3}/.test(cidade)) return false;
    return Boolean(e.cep && e.cidade && e.bairro && e.uf);
  }
  return true;
}

function erroPermiteFallback(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return true;
  }
  if (err instanceof TypeError) return true;
  if (err instanceof LanzaApiError) {
    return [400, 408, 422, 500, 502, 503, 504].includes(err.status);
  }
  return false;
}

export function DocUploadField({
  label,
  tipo,
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  hint,
  disabled,
  onParsed,
  onError,
}: DocUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  async function lerComOcrLocal(
    nome: string,
    conteudoBase64: string,
  ): Promise<{ campos: Record<string, unknown>; avisos: string[] }> {
    let imagemBase64 = conteudoBase64;
    let mime = "image/jpeg";

    if (!isImagem(nome)) {
      setStatus("Extraindo imagem do PDF…");
      const img = await lanzaApi.extrairImagemDocumento({
        tipo,
        nomeArquivo: nome,
        conteudoBase64,
      });
      if (!img.data.imagemBase64) {
        throw new LanzaApiError(422, img.data.avisos?.join(" ") || "Imagem não extraída do PDF.");
      }
      imagemBase64 = img.data.imagemBase64;
      mime = img.data.mime || "image/jpeg";
    }

    setStatus("Lendo documento…");
    const text = await ocrDocumentoNoNavegador(imagemBase64, mime);
    if (!text.trim()) {
      throw new Error("OCR no navegador não extraiu texto.");
    }
    const parsed = await lanzaApi.parseTextoDocumento({ tipo, text });
    return {
      campos: (parsed.data.campos ?? {}) as Record<string, unknown>,
      avisos: parsed.data.avisos ?? [],
    };
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setNomeArquivo(file.name);
    setAvisos([]);
    setStatus("Lendo documento…");
    try {
      const conteudoBase64 = await fileToBase64(file);
      let campos: Record<string, unknown>;
      let avisosLista: string[];

      if (deveTentarOcrLocal(tipo)) {
        try {
          const local = await lerComOcrLocal(file.name, conteudoBase64);
          if (camposDocumentoOk(tipo, local.campos)) {
            setAvisos(local.avisos);
            onParsed({ campos: local.campos, avisos: local.avisos });
            return;
          }
        } catch {
          setStatus("OCR local falhou — tentando no servidor…");
        }
      }

      try {
        const r = await lanzaApi.lerDocumento({
          tipo,
          nomeArquivo: file.name,
          conteudoBase64,
        });
        campos = (r.data.campos ?? {}) as Record<string, unknown>;
        avisosLista = r.data.avisos ?? [];

        if (deveTentarOcrLocal(tipo) && !camposDocumentoOk(tipo, campos)) {
          try {
            const local = await lerComOcrLocal(file.name, conteudoBase64);
            if (camposDocumentoOk(tipo, local.campos)) {
              campos = local.campos;
              avisosLista = local.avisos;
            }
          } catch {
            /* mantém resultado parcial do servidor */
          }
        }
      } catch (err) {
        if (!deveTentarOcrLocal(tipo) || !erroPermiteFallback(err)) {
          throw err;
        }
        const local = await lerComOcrLocal(file.name, conteudoBase64);
        campos = local.campos;
        avisosLista = local.avisos;
      }

      setAvisos(avisosLista);
      onParsed({ campos, avisos: avisosLista });
    } catch (err) {
      const msg = err instanceof LanzaApiError ? err.message : "Falha ao ler documento.";
      onError?.(msg);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  return (
    <div className="doc-upload">
      <label className="field">
        <span className="field__label">{label}</span>
        {hint ? <span className="field__hint">{hint}</span> : null}
        <input
          ref={inputRef}
          type="file"
          className="input doc-upload__input"
          accept={accept}
          disabled={disabled || loading}
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {loading && status ? <p className="doc-upload__status">{status}</p> : null}
      {nomeArquivo && !loading ? (
        <p className="doc-upload__status">
          Arquivo: <strong>{nomeArquivo}</strong>
        </p>
      ) : null}
      {avisos.length > 0 ? (
        <ul className="doc-upload__avisos">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
