import {
  getJsonDocumentAdapter,
  storeNameFromPath,
  type SaveJsonDocumentOptions,
} from "./adapters/index.js";

export function jsonDocumentExists(filePath: string): boolean {
  const storeName = storeNameFromPath(filePath);
  return getJsonDocumentAdapter().exists(storeName, filePath);
}

export function loadJsonDocument<T>(filePath: string): T {
  const storeName = storeNameFromPath(filePath);
  return getJsonDocumentAdapter().load<T>(storeName, filePath);
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
