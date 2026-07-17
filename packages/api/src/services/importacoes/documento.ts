import { HttpError } from "../../http.js";
import { lerDocumentoUpload, type DocTipoUpload } from "../../lib-imports.js";

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

export async function lerDocumento(input: LerDocumentoInput) {
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

  const tipo = normalizarTipo(input.tipo);
  return lerDocumentoUpload({
    tipo,
    nomeArquivo: input.nomeArquivo.trim(),
    conteudoBase64: input.conteudoBase64.trim(),
  });
}
