import type { JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";
import { awaitSync } from "../util/awaitSync.js";
import { skipJsonStoresWrite } from "../repositories/relationalConfig.js";
import { getDbBackend } from "./index.js";
import { FileJsonDocumentAdapter } from "./file.js";
import { PostgresJsonDocumentAdapter } from "./postgres.js";

function logMirrorError(target: "PostgreSQL" | "ficheiro", storeName: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[lanza/db] Falha ao espelhar ${storeName} no ${target}: ${msg}`);
}

function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * Modo dual: grava em JSON local + PostgreSQL.
 * - Local: JSON é fonte da verdade na leitura; grava nos dois.
 * - Vercel: PostgreSQL é fonte na leitura (JSON do deploy é só fallback); grava no Postgres
 *   e tenta espelhar no JSON quando o filesystem permitir.
 */
export class DualJsonDocumentAdapter implements JsonDocumentAdapter {
  private readonly file = new FileJsonDocumentAdapter();
  private readonly postgres = new PostgresJsonDocumentAdapter();

  exists(storeName: string, filePath: string): boolean {
    if (skipJsonStoresWrite()) {
      return this.postgres.exists(storeName, filePath);
    }
    if (isVercelRuntime()) {
      // Postgres síncrono usa awaitSync e bloqueia o event loop na Vercel.
      return this.file.exists(storeName, filePath);
    }
    return this.file.exists(storeName, filePath) || this.postgres.exists(storeName, filePath);
  }

  load<T>(storeName: string, filePath: string): T {
    if (skipJsonStoresWrite()) {
      return this.postgres.load<T>(storeName, filePath);
    }
    if (isVercelRuntime()) {
      return this.file.load<T>(storeName, filePath);
    }
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
    if (skipJsonStoresWrite()) {
      awaitSync(this.postgres.saveAsync(storeName, filePath, data, options));
      return;
    }
    if (!isVercelRuntime()) {
      this.file.save(storeName, filePath, data, options);
    } else {
      try {
        this.file.save(storeName, filePath, data, options);
      } catch (err) {
        logMirrorError("ficheiro", storeName, err);
      }
    }
    if (isVercelRuntime()) {
      void this.postgres.saveAsync(storeName, filePath, data, options).catch((err) => {
        logMirrorError("PostgreSQL", storeName, err);
      });
      return;
    }
    try {
      awaitSync(this.postgres.saveAsync(storeName, filePath, data, options));
    } catch (err) {
      logMirrorError("PostgreSQL", storeName, err);
      throw err;
    }
  }

  async loadAsync<T>(storeName: string, filePath: string): Promise<T | null> {
    if (skipJsonStoresWrite()) {
      return this.postgres.loadAsync<T>(storeName, filePath);
    }
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
    if (skipJsonStoresWrite()) {
      await this.postgres.saveAsync(storeName, filePath, data, options);
      return;
    }
    if (!isVercelRuntime() && getDbBackend() === "dual") {
      this.file.save(storeName, filePath, data, options);
    } else if (isVercelRuntime()) {
      try {
        this.file.save(storeName, filePath, data, options);
      } catch (err) {
        logMirrorError("ficheiro", storeName, err);
      }
    }
    await this.postgres.saveAsync(storeName, filePath, data, options);
  }
}
