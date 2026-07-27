/**
 * Aplica packages/db/sql/022_vendas_parcelas.sql no Postgres (OIDC / .env.local).
 * Uso: npx tsx scripts/apply-migration-022.ts
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
  process.env.LANZA_DB_BACKEND = "postgres";

  const useIamPassword = Boolean(process.env.PGPASSWORD?.trim());
  if (useIamPassword) {
    delete process.env.AWS_ROLE_ARN;
    delete process.env.VERCEL_OIDC_TOKEN;
  } else {
    delete process.env.PGPASSWORD;
    if (!process.env.VERCEL_OIDC_TOKEN?.trim() && !process.env.PGHOST?.trim()) {
      throw new Error("Configure VERCEL_OIDC_TOKEN, PGPASSWORD (token IAM) ou PGHOST em .env.local");
    }
    setVercelPostgresPool(createVercelPostgresPool());
  }
  const pool = getDefaultPostgresPool();
  const sqlPath = resolve(process.cwd(), "packages/db/sql/022_vendas_parcelas.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("Aplicando 022_vendas_parcelas.sql …");
  await pool.query(sql, undefined, "migration-022");

  const check = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'lanza' AND table_name = 'vendas'
         AND column_name = 'valor_parcela'
     ) AS exists`,
    undefined,
    "check-022",
  );
  console.log("valor_parcela existe:", check.rows[0]?.exists === true);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
