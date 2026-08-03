/**
 * Aplica packages/db/sql/025_veiculo_tarifas.sql
 * Uso: PGPASSWORD=<token IAM> npx tsx scripts/apply-migration-025.ts
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

  if (!process.env.PGPASSWORD?.trim()) {
    throw new Error("Defina PGPASSWORD com o token IAM RDS.");
  }
  delete process.env.AWS_ROLE_ARN;
  delete process.env.VERCEL_OIDC_TOKEN;

  if (!process.env.PGHOST?.trim()) {
    process.env.PGHOST =
      "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com";
  }
  process.env.PGPORT ??= "5432";
  process.env.PGUSER ??= "postgres";
  process.env.PGDATABASE ??= "postgres";
  process.env.PGSSLMODE ??= "require";

  const pool = getDefaultPostgresPool();
  const sqlPath = resolve(process.cwd(), "packages/db/sql/025_veiculo_tarifas.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("Aplicando 025_veiculo_tarifas.sql …");
  await pool.query(sql, undefined, "migration-025");

  const check = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'lanza'
       AND table_name = 'veiculos'
       AND column_name IN ('valor_semanal', 'valor_mensal', 'valor_diaria', 'valor_caucao')
     ORDER BY column_name`,
    undefined,
    "check-025-cols",
  );
  console.log(
    "colunas:",
    check.rows.map((r) => r.column_name).join(", ") || "AUSENTES",
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
