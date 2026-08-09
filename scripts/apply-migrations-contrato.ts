/**
 * Aplica migrations 017 e 019 no Postgres (PGPASSWORD local ou IAM via AWS CLI).
 * Uso: npx tsx scripts/apply-migrations-contrato.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { closePgPool, getDefaultPostgresPool } from "@lanza/db";

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

async function applyMigration(file: string, checkColumn: string): Promise<void> {
  const pool = getDefaultPostgresPool();
  const sqlPath = resolve(process.cwd(), "packages/db/sql", file);
  const sql = readFileSync(sqlPath, "utf8");
  console.log(`Aplicando ${file} …`);
  await pool.query(sql, undefined, file.replace(".sql", ""));

  const check = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'lanza' AND table_name = 'contratos'
         AND column_name = $1
     ) AS exists`,
    [checkColumn],
    `check-${checkColumn}`,
  );
  console.log(`${checkColumn}:`, check.rows[0]?.exists === true ? "OK" : "FALHOU");
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";

  if (!process.env.PGHOST?.trim()) {
    throw new Error("PGHOST não configurado. Execute .\\scripts\\set-postgres-user-env.ps1");
  }
  if (!process.env.PGPASSWORD?.trim() && !process.env.AWS_ROLE_ARN?.trim()) {
    throw new Error(
      "Defina PGPASSWORD (senha RDS) ou configure AWS CLI (aws login) para token IAM.",
    );
  }

  await applyMigration("017_contrato_assinado.sql", "contrato_assinado_storage_key");
  await applyMigration("019_hora_inicio.sql", "hora_inicio");
  console.log("Migrations concluídas.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
