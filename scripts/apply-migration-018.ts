/**
 * Aplica packages/db/sql/018_portal_sessions.sql
 * Uso: npx tsx scripts/apply-migration-018.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { closePgPool, getDefaultPostgresPool } from "@lanza/db";

function loadEnvLocal(): void {
  const envLocal = resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocal)) return;
  for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]!]) continue;
    let v = m[2]!.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]!] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";

  const pool = getDefaultPostgresPool();
  const sqlPath = resolve(process.cwd(), "packages/db/sql/018_portal_sessions.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("Aplicando 018_portal_sessions.sql …");
  await pool.query(sql, undefined, "migration-018");

  const check = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'lanza' AND table_name = 'portal_sessions'`,
    undefined,
    "check-018-table",
  );
  console.log(check.rows.length ? "OK: lanza.portal_sessions existe." : "ERRO: tabela ausente.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
