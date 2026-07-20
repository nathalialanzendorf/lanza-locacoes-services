import { JsonStoreRepository } from "../stores/JsonStoreRepository.js";
import { PostgresPool } from "../client/PostgresPool.js";
import { awaitSync } from "../util/awaitSync.js";
import { skipJsonStoresWrite } from "../repositories/relationalConfig.js";
import {
  hasRelationalStore,
  loadRelationalStore,
  relationalStoreExists,
  saveRelationalStore,
} from "../repositories/relationalRouter.js";
import type { JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";

export class PostgresJsonDocumentAdapter implements JsonDocumentAdapter {
  private readonly stores: JsonStoreRepository;

  constructor(pool?: PostgresPool) {
    this.stores = new JsonStoreRepository(pool ?? new PostgresPool());
  }

  exists(storeName: string, _filePath: string): boolean {
    if (process.env.VERCEL) return false;
    if (skipJsonStoresWrite() && hasRelationalStore(storeName)) {
      return awaitSync(relationalStoreExists(storeName));
    }
    return awaitSync(this.stores.exists(storeName));
  }

  load<T>(storeName: string, filePath: string): T {
    if (process.env.VERCEL) {
      throw new Error(
        `PostgresJsonDocumentAdapter.load("${storeName}") não pode ser síncrono na Vercel — use loadAsync ou loadJsonDocumentForApi`,
      );
    }
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
    if (process.env.VERCEL) {
      void this.saveAsync(storeName, filePath, data, options).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[lanza/db] Falha ao gravar ${storeName} no PostgreSQL: ${msg}`);
      });
      return;
    }
    awaitSync(this.saveAsync(storeName, filePath, data, options));
  }

  async loadAsync<T>(storeName: string, _filePath: string): Promise<T | null> {
    if (skipJsonStoresWrite() && hasRelationalStore(storeName)) {
      return loadRelationalStore<T>(storeName);
    }
    return this.stores.load<T>(storeName);
  }

  async saveAsync(
    storeName: string,
    _filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): Promise<void> {
    if (skipJsonStoresWrite() && hasRelationalStore(storeName)) {
      await saveRelationalStore(storeName, data);
      return;
    }
    if (skipJsonStoresWrite()) return;
    await this.stores.save(storeName, data, options?.description);
  }
}
