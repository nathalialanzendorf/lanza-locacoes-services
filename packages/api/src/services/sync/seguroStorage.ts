import path from "node:path";

import {
  blobKey,
  extrairSeguroComprovanteBuffer,
  getBytes,
  isStorageActive,
  listBlobs,
  storagePrefix,
  type SeguroBoletoExtraido,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";
import * as documentos from "../documentos.js";

export const SEGURO_BLOB_PARTS = ["seguro", "comprovantes"] as const;

export function seguroComprovanteBlobPrefix(ano?: string, mes?: string): string {
  const parts: string[] = [...SEGURO_BLOB_PARTS];
  if (ano) parts.push(ano);
  if (mes) parts.push(mes.padStart(2, "0"));
  return blobKey(...parts);
}

export function seguroOrigemFromBlobKey(blobKeyPath: string): string {
  const prefix = storagePrefix();
  if (blobKeyPath.startsWith(`${prefix}/`)) {
    return blobKeyPath.slice(prefix.length + 1);
  }
  return blobKeyPath;
}

export function seguroComprovanteBlobKey(ano: string, mes: string, filename: string): string {
  const safe = path.basename(filename).replace(/[^\w.\-()+ ]/g, "_");
  return blobKey(...SEGURO_BLOB_PARTS, ano, mes.padStart(2, "0"), safe);
}

export async function uploadSeguroComprovantes(input: {
  ano: string;
  mes: string;
  arquivos: Array<{ nome: string; conteudo: Buffer }>;
}): Promise<{
  uploaded: Array<{ pathname: string; nome: string; size: number }>;
  erros: string[];
}> {
  if (!isStorageActive()) {
    throw new HttpError(
      503,
      process.env.VERCEL
        ? "Armazenamento Blob não configurado na Vercel — crie um Blob Store e defina BLOB_READ_WRITE_TOKEN."
        : "Armazenamento Blob não configurado",
    );
  }

  const uploaded: Array<{ pathname: string; nome: string; size: number }> = [];
  const erros: string[] = [];

  for (const arq of input.arquivos) {
    if (!arq.nome.trim()) {
      erros.push("Arquivo sem nome");
      continue;
    }
    if (!arq.conteudo.length) {
      erros.push(`${arq.nome}: conteúdo vazio`);
      continue;
    }
    try {
      const key = seguroComprovanteBlobKey(input.ano, input.mes, arq.nome);
      const stored = await documentos.enviarDocumentoBinario({
        pathname: key,
        conteudo: arq.conteudo,
        contentType: "application/pdf",
        tipo: "seguro-comprovante",
      });
      uploaded.push({ pathname: stored.pathname, nome: arq.nome, size: stored.size });
    } catch (e) {
      erros.push(`${arq.nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { uploaded, erros };
}

/** Extrai boletos dos PDFs recém-enviados (usa buffer em memória, sem reler o Blob). */
export async function extrairSeguroDeUpload(input: {
  arquivos: Array<{ nome: string; conteudo: Buffer }>;
  uploaded: Array<{ pathname: string; nome: string; size: number }>;
}): Promise<{ boletos: SeguroBoletoExtraido[]; erros: string[] }> {
  const boletos: SeguroBoletoExtraido[] = [];
  const erros: string[] = [];
  const byNome = new Map(input.uploaded.map((u) => [u.nome, u]));

  for (const arq of input.arquivos) {
    const up = byNome.get(arq.nome);
    if (!up) {
      erros.push(`${arq.nome}: upload falhou ou não encontrado`);
      continue;
    }
    try {
      const origem = seguroOrigemFromBlobKey(up.pathname);
      const b = await extrairSeguroComprovanteBuffer(arq.conteudo, {
        filename: arq.nome,
        origem,
      });
      if (b) boletos.push(b);
      else erros.push(`Sem placa/valor: ${arq.nome}`);
    } catch (e) {
      erros.push(`${arq.nome}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { boletos, erros };
}

async function listarPdfBlobs(prefix: string): Promise<Array<{ pathname: string }>> {
  const out: Array<{ pathname: string }> = [];
  let cursor: string | undefined;

  do {
    const page = await listBlobs({ prefix, limit: 100, cursor });
    for (const b of page.blobs) {
      if (b.pathname.toLowerCase().endsWith(".pdf")) {
        out.push({ pathname: b.pathname });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return out;
}

export async function extrairSeguroComprovantesBlob(opts: {
  anos: string[];
  mes?: string;
}): Promise<{
  boletos: SeguroBoletoExtraido[];
  erros: string[];
  prefixes: string[];
  pdfs: number;
}> {
  if (!isStorageActive()) {
    throw new HttpError(
      503,
      "Armazenamento Blob não configurado — envie os PDFs via upload antes de executar o sync.",
    );
  }

  const boletos: SeguroBoletoExtraido[] = [];
  const erros: string[] = [];
  const prefixes: string[] = [];
  let pdfs = 0;

  for (const ano of opts.anos) {
    const prefix = opts.mes
      ? seguroComprovanteBlobPrefix(ano, opts.mes)
      : seguroComprovanteBlobPrefix(ano);
    prefixes.push(prefix);

    const blobs = await listarPdfBlobs(prefix);
    pdfs += blobs.length;

    for (const { pathname } of blobs) {
      try {
        const buf = await getBytes(pathname);
        if (!buf) {
          erros.push(`Não foi possível ler: ${pathname}`);
          continue;
        }
        const filename = path.basename(pathname);
        const origem = seguroOrigemFromBlobKey(pathname);
        const b = await extrairSeguroComprovanteBuffer(buf, { filename, origem });
        if (b) boletos.push(b);
        else erros.push(`Sem placa/valor: ${pathname}`);
      } catch (e) {
        erros.push(`${pathname}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { boletos, erros, prefixes, pdfs };
}
