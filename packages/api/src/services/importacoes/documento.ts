import { HttpError } from "../../http.js";
import {
  extrairImagemDocumento,
  lerDocumentoUpload,
  parseDocumentoTexto,
  type DocTipoUpload,
} from "../../lib-imports.js";

const TIPOS: DocTipoUpload[] = ["cnh", "comprovante-residencia", "crlv"];

export type LerDocumentoInput = {
  tipo: string;
  nomeArquivo: string;
  conteudoBase64: string;
};

function normalizarTipo(raw: string): DocTipoUpload {
  const t = raw.trim().toLowerCase() as DocTipoUpload;
  if (!TIPOS.includes(t)) {
    throw new HttpError(400, `Tipo inválido: ${raw}. Use: ${TIPOS.join(", ")}`);
  }
  return t;
}

function validarUpload(input: LerDocumentoInput): { buf: Buffer; tipo: DocTipoUpload } {
  if (!input.nomeArquivo?.trim()) {
    throw new HttpError(400, 'Campo "nomeArquivo" é obrigatório');
  }
  if (!input.conteudoBase64?.trim()) {
    throw new HttpError(400, 'Campo "conteudoBase64" é obrigatório');
  }

  const buf = Buffer.from(input.conteudoBase64, "base64");
  if (buf.length === 0) {
    throw new HttpError(400, "Arquivo vazio ou base64 inválido");
  }
  if (buf.length > 12 * 1024 * 1024) {
    throw new HttpError(413, "Arquivo excede 12 MB");
  }

  return {
    buf,
    tipo: normalizarTipo(input.tipo),
  };
}

export async function lerDocumento(input: LerDocumentoInput) {
  const { buf, tipo } = validarUpload(input);
  return lerDocumentoUpload({
    tipo,
    nomeArquivo: input.nomeArquivo.trim(),
    conteudoBase64: buf.toString("base64"),
  });
}

export async function extrairImagem(input: LerDocumentoInput) {
  const { buf, tipo } = validarUpload(input);
  if (tipo === "crlv") {
    throw new HttpError(400, "Extração de imagem não disponível para CRLV.");
  }
  const r = await extrairImagemDocumento(buf, input.nomeArquivo.trim());
  return { tipo, ...r };
}

export function parseTexto(input: { tipo: string; text: string }) {
  const tipo = normalizarTipo(input.tipo);
  const text = String(input.text ?? "");
  const campos = parseDocumentoTexto(tipo, text);
  const avisos = "avisos" in campos && Array.isArray(campos.avisos) ? campos.avisos : [];
  return { tipo, campos, avisos, textoChars: text.length };
}
