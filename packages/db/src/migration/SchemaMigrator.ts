import fs from "node:fs";

import type { PostgresPool } from "../client/PostgresPool.js";
import { INITIAL_SCHEMA_SQL } from "../paths.js";

/**
 * Aplica migrações SQL do pacote (schema `lanza`, tabela `json_stores`).
 */
export class SchemaMigrator {
  constructor(
    private readonly pool: PostgresPool,
    private readonly schemaPath: string = INITIAL_SCHEMA_SQL,
  ) {}

  async migrate(dryRun = false): Promise<void> {
    const sql = fs.readFileSync(this.schemaPath, "utf8");
    if (dryRun) {
      console.log(`[dry-run] Executaria schema (${this.schemaPath}, ${sql.length} bytes)`);
      return;
    }
    await this.pool.query(sql);
  }
}

export async function runSchemaMigration(dryRun = false): Promise<void> {
  const { getDefaultPostgresPool } = await import("../client/PostgresPool.js");
  await new SchemaMigrator(getDefaultPostgresPool()).migrate(dryRun);
}
