import fs from "node:fs";
import path from "node:path";

import type { PostgresPool } from "../client/PostgresPool.js";
import { SQL_DIR } from "../paths.js";

/**
 * Aplica migrações SQL do pacote (ficheiros `packages/db/sql/*.sql` por ordem).
 */
export class SchemaMigrator {
  constructor(private readonly pool: PostgresPool) {}

  async migrate(dryRun = false): Promise<void> {
    const files = fs
      .readdirSync(SQL_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const schemaPath = path.join(SQL_DIR, file);
      const sql = fs.readFileSync(schemaPath, "utf8");
      if (dryRun) {
        console.log(`[dry-run] Executaria ${file} (${schemaPath}, ${sql.length} bytes)`);
        continue;
      }
      await this.pool.query(sql);
    }
  }
}

export async function runSchemaMigration(dryRun = false): Promise<void> {
  const { getDefaultPostgresPool } = await import("../client/PostgresPool.js");
  await new SchemaMigrator(getDefaultPostgresPool()).migrate(dryRun);
}
