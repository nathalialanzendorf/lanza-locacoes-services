import type { JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";
import { FileJsonDocumentAdapter } from "./file.js";
import { PostgresJsonDocumentAdapter } from "./postgres.js";

function logMirrorError(storeName: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[lanza/db] Falha ao espelhar ${storeName} no PostgreSQL: ${msg}`);
}

/**
 * Durante a migração: ficheiro JSON continua fonte da verdade;
 * gravações são espelhadas assincronamente no PostgreSQL.
 */
export class DualJsonDocumentAdapter implements JsonDocumentAdapter {
  private readonly file = new FileJsonDocumentAdapter();
  private readonly postgres = new PostgresJsonDocumentAdapter();

  exists(storeName: string, filePath: string): boolean {
    return this.file.exists(storeName, filePath) || this.postgres.exists(storeName, filePath);
  }

  load<T>(storeName: string, filePath: string): T {
    if (this.file.exists(storeName, filePath)) {
      return this.file.load<T>(storeName, filePath);
    }
    return this.postgres.load<T>(storeName, filePath);
  }

  save(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): void {
    this.file.save(storeName, filePath, data, options);
    void this.postgres.saveAsync(storeName, filePath, data, options).catch((err) => {
      logMirrorError(storeName, err);
    });
  }

  async loadAsync<T>(storeName: string, filePath: string): Promise<T | null> {
    if (this.file.exists(storeName, filePath)) {
      return this.file.loadAsync<T>(storeName, filePath);
    }
    return this.postgres.loadAsync<T>(storeName, filePath);
  }

  async saveAsync(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): Promise<void> {
    this.file.save(storeName, filePath, data, options);
    await this.postgres.saveAsync(storeName, filePath, data, options);
  }
}
