import { JsonStoreRepository } from "../stores/JsonStoreRepository.js";
import { PostgresPool } from "../client/PostgresPool.js";
import { awaitSync } from "../util/awaitSync.js";
import type { JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";

export class PostgresJsonDocumentAdapter implements JsonDocumentAdapter {
  private readonly stores: JsonStoreRepository;

  constructor(pool?: PostgresPool) {
    this.stores = new JsonStoreRepository(pool ?? new PostgresPool());
  }

  exists(storeName: string, _filePath: string): boolean {
    return awaitSync(this.stores.exists(storeName));
  }

  load<T>(storeName: string, filePath: string): T {
    const data = awaitSync(this.loadAsync<T>(storeName, filePath));
    if (data == null) {
      throw new Error(`Store PostgreSQL ausente: ${storeName}`);
    }
    return data;
  }

  save(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): void {
    awaitSync(this.saveAsync(storeName, filePath, data, options));
  }

  async loadAsync<T>(storeName: string, _filePath: string): Promise<T | null> {
    return this.stores.load<T>(storeName);
  }

  async saveAsync(
    storeName: string,
    _filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): Promise<void> {
    await this.stores.save(storeName, data, options?.description);
  }
}
