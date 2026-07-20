import {
  getDbBackend,
  getJsonDocumentAdapter,
  storeNameFromPath,
  type SaveJsonDocumentOptions,
} from "./adapters/index.js";
import { awaitSync } from "./util/awaitSync.js";

/** Backend relacional (Postgres) — leituras/gravações síncronas espelham loadAsync/saveAsync. */
function useRelationalAdapter(): boolean {
  return getDbBackend() !== "file";
}

export function jsonDocumentExists(filePath: string): boolean {
  const storeName = storeNameFromPath(filePath);
  if (useRelationalAdapter()) {
    const data = awaitSync(getJsonDocumentAdapter().loadAsync(storeName, filePath));
    return data != null;
  }
  return getJsonDocumentAdapter().exists(storeName, filePath);
}

export function loadJsonDocument<T>(filePath: string): T {
  const storeName = storeNameFromPath(filePath);
  if (useRelationalAdapter()) {
    const data = awaitSync(getJsonDocumentAdapter().loadAsync<T>(storeName, filePath));
    if (data == null) {
      throw new Error(`Documento ausente: ${filePath}`);
    }
    return data;
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
  const adapter = getJsonDocumentAdapter();
  const payload = data as Record<string, unknown>;
  if (useRelationalAdapter()) {
    awaitSync(adapter.saveAsync(storeName, filePath, payload, options));
    return;
  }
  adapter.save(storeName, filePath, payload, options);
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
