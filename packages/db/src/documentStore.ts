import {
  FileJsonDocumentAdapter,
  getDbBackend,
  getJsonDocumentAdapter,
  storeNameFromPath,
  type SaveJsonDocumentOptions,
} from "./adapters/index.js";

/** Na Vercel com Postgres, leituras síncronas via `awaitSync` bloqueiam o event loop. */
function vercelSyncReadsFileOnly(): boolean {
  return Boolean(process.env.VERCEL) && getDbBackend() !== "file";
}

function fileAdapter(): FileJsonDocumentAdapter {
  return new FileJsonDocumentAdapter();
}

export function jsonDocumentExists(filePath: string): boolean {
  const storeName = storeNameFromPath(filePath);
  if (vercelSyncReadsFileOnly()) {
    return fileAdapter().exists(storeName, filePath);
  }
  return getJsonDocumentAdapter().exists(storeName, filePath);
}

export function loadJsonDocument<T>(filePath: string): T {
  const storeName = storeNameFromPath(filePath);
  if (vercelSyncReadsFileOnly()) {
    return fileAdapter().load<T>(storeName, filePath);
  }
  return getJsonDocumentAdapter().load<T>(storeName, filePath);
}

/** Leitura assíncrona para rotas HTTP — usa Postgres quando backend ≠ file. */
export async function loadJsonDocumentForApi<T>(
  filePath: string,
  whenMissing: T,
): Promise<T> {
  const storeName = storeNameFromPath(filePath);
  if (getDbBackend() === "file") {
    if (!jsonDocumentExists(filePath)) return whenMissing;
    return loadJsonDocument<T>(filePath);
  }
  const data = await getJsonDocumentAdapter().loadAsync<T>(storeName, filePath);
  return data ?? whenMissing;
}

export function saveJsonDocument(
  filePath: string,
  data: object,
  options?: SaveJsonDocumentOptions,
): void {
  const storeName = storeNameFromPath(filePath);
  getJsonDocumentAdapter().save(storeName, filePath, data as Record<string, unknown>, options);
}

export async function loadJsonDocumentAsync<T>(filePath: string): Promise<T | null> {
  const storeName = storeNameFromPath(filePath);
  return getJsonDocumentAdapter().loadAsync<T>(storeName, filePath);
}

export async function saveJsonDocumentAsync(
  filePath: string,
  data: Record<string, unknown>,
  options?: SaveJsonDocumentOptions,
): Promise<void> {
  const storeName = storeNameFromPath(filePath);
  await getJsonDocumentAdapter().saveAsync(storeName, filePath, data, options);
}

export {
  getDbBackend,
  getJsonDocumentAdapter,
  createJsonDocumentAdapter,
  storeNameFromPath,
  resetJsonDocumentAdapterCache,
  type DbBackend,
  type JsonDocumentAdapter,
  type SaveJsonDocumentOptions,
} from "./adapters/index.js";
