import { useRef, useState } from "react";

import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

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
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  async function handleFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setNomeArquivo(file.name);
    setAvisos([]);
    try {
      const conteudoBase64 = await fileToBase64(file);
      const r = await lanzaApi.lerDocumento({
        tipo,
        nomeArquivo: file.name,
        conteudoBase64,
      });
      const avisosLista = r.data.avisos ?? [];
      setAvisos(avisosLista);
      onParsed({
        campos: (r.data.campos ?? {}) as Record<string, unknown>,
        avisos: avisosLista,
      });
    } catch (err) {
      const msg = err instanceof LanzaApiError ? err.message : "Falha ao ler documento.";
      onError?.(msg);
    } finally {
      setLoading(false);
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
      {loading ? (
        <p className="doc-upload__status">
          {tipo === "cnh" ? "Lendo CNH (OCR pode levar alguns segundos)…" : "Lendo documento…"}
        </p>
      ) : null}
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
