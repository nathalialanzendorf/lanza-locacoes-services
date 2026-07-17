export {
  blobReadWriteToken,
  isBlobConfigured,
  isStorageActive,
  localMirrorRoot,
  storagePrefix,
} from "./config.js";
export {
  blobKey,
  blobKeyFromLocalFile,
  mimeFromFilename,
  relPathFromRepo,
} from "./paths.js";
export type { ListBlobsResult, StoredBlob } from "./types.js";
export {
  deleteBlob,
  getBytes,
  getText,
  headBlob,
  listBlobs,
  putBytes,
  putJson,
  putText,
} from "./blobStore.js";

import fs from "node:fs";

import { putBytes } from "./blobStore.js";
import { isStorageActive } from "./config.js";
import { blobKeyFromLocalFile, mimeFromFilename } from "./paths.js";
import type { StoredBlob } from "./types.js";

export type MirrorLocalFilesResult = {
  uploaded: StoredBlob[];
  skipped: string[];
  errors: { path: string; error: string }[];
};

/** Lê ficheiros locais gerados e envia para Blob (ou espelho local). */
export async function mirrorLocalFilesToBlob(
  files: string[],
  prefix?: string,
): Promise<MirrorLocalFilesResult> {
  const uploaded: StoredBlob[] = [];
  const skipped: string[] = [];
  const errors: { path: string; error: string }[] = [];

  if (!isStorageActive()) {
    return { uploaded, skipped: [...files], errors };
  }

  for (const filePath of files) {
    const abs = filePath.trim();
    if (!abs) continue;
    if (!fs.existsSync(abs)) {
      skipped.push(abs);
      continue;
    }
    try {
      const key = blobKeyFromLocalFile(abs, prefix);
      const body = fs.readFileSync(abs);
      const stored = await putBytes(key, body, {
        contentType: mimeFromFilename(abs),
        allowOverwrite: true,
      });
      uploaded.push(stored);
    } catch (err) {
      errors.push({
        path: abs,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { uploaded, skipped, errors };
}

export async function persistPacoteRelatorio(input: {
  prefix: string;
  arquivos: { nome: string; conteudo: string | Buffer; contentType?: string }[];
}): Promise<MirrorLocalFilesResult> {
  const uploaded: StoredBlob[] = [];
  const skipped: string[] = [];
  const errors: { path: string; error: string }[] = [];

  if (!isStorageActive()) {
    return { uploaded, skipped: input.arquivos.map((a) => a.nome), errors };
  }

  for (const arq of input.arquivos) {
    try {
      const key = blobKeyFromLocalFile(arq.nome, input.prefix);
      const stored = await putBytes(key, arq.conteudo, {
        contentType: arq.contentType ?? mimeFromFilename(arq.nome),
        allowOverwrite: true,
      });
      uploaded.push(stored);
    } catch (err) {
      errors.push({
        path: arq.nome,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { uploaded, skipped, errors };
}
