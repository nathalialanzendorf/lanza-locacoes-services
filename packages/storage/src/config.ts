export function blobReadWriteToken(): string | null {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.LANZA_BLOB_READ_WRITE_TOKEN?.trim() ||
    null;
  return token || null;
}

/** Prefixo lógico dentro do Blob store (ex.: lanza-docs). */
export function storagePrefix(): string {
  const raw = process.env.LANZA_STORAGE_PREFIX?.trim() || "lanza-docs";
  return raw.replace(/^\/+|\/+$/g, "");
}

/** Espelho local quando não há token Blob (dev). */
export function localMirrorRoot(): string | null {
  const raw = process.env.LANZA_STORAGE_LOCAL_MIRROR?.trim();
  if (raw === "0" || raw === "false" || raw === "nao" || raw === "não") return null;
  if (raw && raw !== "1" && raw !== "true" && raw !== "sim") return raw;
  return "relatorios/_tmp/blob-mirror";
}

export function isBlobConfigured(): boolean {
  return Boolean(blobReadWriteToken());
}

export function isStorageActive(): boolean {
  return isBlobConfigured() || Boolean(localMirrorRoot());
}
