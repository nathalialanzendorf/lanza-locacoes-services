/**
 * Aplica packages/db/sql/024_cliente_despesas_status_cobranca.sql
 * Uso: PGPASSWORD=<token IAM> npx tsx scripts/apply-migration-024.ts
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
  const sqlPath = resolve(process.cwd(), "packages/db/sql/024_cliente_despesas_status_cobranca.sql");
  const sql = readFileSync(sqlPath, "utf8");

  console.log("Aplicando 024_cliente_despesas_status_cobranca.sql …");
  await pool.query(sql, undefined, "migration-024");

  const check = await pool.query<{ column_name: string; column_default: string | null }>(
    `SELECT column_name, column_default
     FROM information_schema.columns
     WHERE table_schema = 'lanza'
       AND table_name = 'cliente_despesas'
       AND column_name = 'status_cobranca'`,
    undefined,
    "check-024-col",
  );
  console.log("coluna:", check.rows[0] ?? "AUSENTE");

  const counts = await pool.query<{ status_cobranca: string; n: number }>(
    `SELECT status_cobranca, count(*)::int AS n
     FROM lanza.cliente_despesas
     GROUP BY status_cobranca
     ORDER BY status_cobranca`,
    undefined,
    "check-024-counts",
  );
  console.log("distribuição:", counts.rows);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
