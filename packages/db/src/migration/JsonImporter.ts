import fs from "node:fs";
import path from "node:path";

import type { PostgresPool } from "../client/PostgresPool.js";
import { DATABASE_DIR } from "../paths.js";
import { JsonStoreRepository } from "../stores/JsonStoreRepository.js";
import { JSON_STORE_FILES, jsonFileToStoreName } from "../stores/registry.js";

export type ImportResult = {
  imported: string[];
  skipped: string[];
};

/**
 * Importa ficheiros `database/*.json` para `lanza.json_stores`.
 */
export class JsonImporter {
  constructor(
    private readonly pool: PostgresPool,
    private readonly databaseDir: string = DATABASE_DIR,
  ) {}

  async importAll(dryRun = false): Promise<ImportResult> {
    return this.importFiles([...JSON_STORE_FILES], dryRun);
  }

  async importFiles(files: readonly string[], dryRun = false): Promise<ImportResult> {
    const stores = new JsonStoreRepository(this.pool);
    const imported: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const full = path.join(this.databaseDir, file);
      if (!fs.existsSync(full)) {
        skipped.push(file);
        continue;
      }

      const raw = fs.readFileSync(full, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const storeName = jsonFileToStoreName(file);
      const description =
        typeof data.descricao === "string" ? data.descricao : `Importado de database/${file}`;

      if (dryRun) {
        console.log(`[dry-run] Importaria ${storeName} (${raw.length} bytes)`);
        imported.push(storeName);
        continue;
      }

      await stores.save(storeName, data, description);
      imported.push(storeName);
    }

    return { imported, skipped };
  }
}

export async function importJsonStores(
  dryRun = false,
  files?: readonly string[],
): Promise<ImportResult> {
  const { getDefaultPostgresPool } = await import("../client/PostgresPool.js");
  const importer = new JsonImporter(getDefaultPostgresPool());
  if (files?.length) return importer.importFiles(files, dryRun);
  return importer.importAll(dryRun);
}
