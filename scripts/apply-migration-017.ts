/**
 * Aplica packages/db/sql/017_contrato_assinado.sql no Postgres (OIDC / .env.local).
 * Uso: npx tsx scripts/apply-migration-017.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  closePgPool,
  createVercelPostgresPool,
  getDefaultPostgresPool,
  setVercelPostgresPool,
} from "@lanza/db";

function loadEnvLocal(): void {
  const envLocal = resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocal)) return;
  for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  delete process.env.PGPASSWORD;
  process.env.LANZA_DB_BACKEND = "postgres";

  if (!process.env.VERCEL_OIDC_TOKEN?.trim() && !process.env.PGHOST?.trim()) {
    throw new Error("Configure VERCEL_OIDC_TOKEN ou PGHOST em .env.local");
  }

  setVercelPostgresPool(createVercelPostgresPool());
  const pool = getDefaultPostgresPool();
  const sqlPath = resolve(process.cwd(), "packages/db/sql/017_contrato_assinado.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("Aplicando 017_contrato_assinado.sql …");
  await pool.query(sql, undefined, "migration-017");

  const check = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'lanza' AND table_name = 'contratos'
         AND column_name = 'contrato_assinado_storage_key'
     ) AS exists`,
    undefined,
    "check-017",
  );
  console.log("contrato_assinado_storage_key existe:", check.rows[0]?.exists === true);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
