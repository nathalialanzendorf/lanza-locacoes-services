export function blobReadWriteToken(): string | null {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.LANZA_BLOB_READ_WRITE_TOKEN?.trim() ||
    null;
  return token || null;
}

export function blobStoreId(): string | null {
  return process.env.BLOB_STORE_ID?.trim() || null;
}

/** Deve coincidir com o access do Blob Store na Vercel (`private` ou `public`). */
export function blobAccess(): "private" | "public" {
  const raw =
    process.env.BLOB_ACCESS?.trim() ||
    process.env.LANZA_BLOB_ACCESS?.trim() ||
    "private";
  return raw.toLowerCase() === "public" ? "public" : "private";
}

function isReadOnlyServerlessFs(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export { isReadOnlyServerlessFs };

/** Prefixo lógico dentro do Blob store (ex.: lanza-docs). */
export function storagePrefix(): string {
  const raw = process.env.LANZA_STORAGE_PREFIX?.trim() || "lanza-docs";
  return raw.replace(/^\/+|\/+$/g, "");
}

/** Espelho local quando não há token Blob (dev). Desativado em Vercel/Lambda (FS read-only). */
export function localMirrorRoot(): string | null {
  const raw = process.env.LANZA_STORAGE_LOCAL_MIRROR?.trim();
  if (raw === "0" || raw === "false" || raw === "nao" || raw === "não") return null;
  if (isReadOnlyServerlessFs()) {
    if (raw && raw !== "1" && raw !== "true" && raw !== "sim") return raw;
    return null;
  }
  if (raw && raw !== "1" && raw !== "true" && raw !== "sim") return raw;
  return "relatorios/_tmp/blob-mirror";
}

/** Blob ativo: token estático ou OIDC na Vercel (BLOB_STORE_ID). */
export function isBlobConfigured(): boolean {
  if (blobReadWriteToken()) return true;
  if (process.env.VERCEL && blobStoreId()) return true;
  return false;
}

export function isStorageActive(): boolean {
  return isBlobConfigured() || Boolean(localMirrorRoot());
}
