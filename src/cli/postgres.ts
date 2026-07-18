import pg from "pg";

import {
  closePgPool,
  getPgConfig,
  migratePostgres,
  pgQuery,
  pgSslOptions,
  resolvePgPassword,
} from "../lib/postgres/index.js";
import { importJsonStores, runSchemaMigration } from "@lanza/db";
import { PgAuthError } from "@lanza/db";

const HELP = `postgres — conexão PostgreSQL (RDS AWS)

Subcomandos:
  check [--json]              Testa conexão (SELECT version(), current_database())
  set-password <senha>        Define senha do PGUSER (via IAM: AWS CLI ou token no PGPASSWORD)
  set-password <senha> --from-env  Usa PGPASSWORD actual como token IAM (copiado do console AWS)
  migrate [--import-json] [--dry-run]
                              Cria schema lanza.json_stores; opcionalmente importa database/*.json
  sync-store <ficheiro.json>  Espelha um ficheiro database/*.json no PostgreSQL (ex.: contratos.json)
  sync-all                    Espelha todos os database/*.json importáveis no PostgreSQL

Alternativa via pacote @lanza/db:
  npm run db:check
  npm run db:migrate -- --import-json

Variáveis (persistentes do utilizador — ver .\\scripts\\set-postgres-user-env.ps1):
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGSSLMODE
  PGPASSWORD                  (recomendado local — senha RDS)
  AWS_REGION, AWS_ROLE_ARN      (IAM na Vercel; localmente use PGPASSWORD)
  DATABASE_URL                (alternativa única às PG*)
  LANZA_DB_BACKEND            file (padrão) | dual | postgres — backend dos *Db.ts

Autenticação local:
  AWS_ROLE_ARN (Vercel OIDC) só funciona na Vercel.
  Para sync local: .\\scripts\\set-postgres-user-env.ps1 -PromptPassword
`;

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function main(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "-h" || sub === "--help") {
    console.log(HELP);
    process.exit(sub ? 0 : 1);
  }

  try {
    switch (sub) {
      case "check": {
        const json = hasFlag(args, "--json");
        const config = getPgConfig();
        const res = await pgQuery<{ version: string; db: string; now: string }>(
          `SELECT version() AS version, current_database() AS db, now()::text AS now`,
        );
        const row = res.rows[0];
        if (json) {
          console.log(
            JSON.stringify(
              {
                ok: true,
                host: config.host,
                database: config.database,
                user: config.user,
                sslMode: config.sslMode,
                auth: config.password ? "password" : "iam",
                ...row,
              },
              null,
              2,
            ),
          );
        } else {
          console.log("OK — conectado ao PostgreSQL");
          console.log(`  Host:     ${config.host}:${config.port}`);
          console.log(`  Database: ${row?.db}`);
          console.log(`  User:     ${config.user}`);
          console.log(`  Auth:     ${config.password ? "PGPASSWORD" : "IAM (RDS Signer)"}`);
          console.log(`  Server:   ${row?.version?.split(",")[0] ?? "?"}`);
          console.log(`  Now:      ${row?.now}`);
        }
        break;
      }
      case "set-password": {
        const newPass = args[1]?.trim();
        const useEnvToken = hasFlag(args, "--from-env");
        if (!newPass) {
          console.error("Uso: postgres set-password <nova-senha> [--from-env]");
          console.error("  --from-env  usa PGPASSWORD como token IAM (valido ~15 min, copiado do console AWS)");
          process.exit(1);
        }
        const config = getPgConfig();
        const token = useEnvToken && config.password
          ? config.password
          : await resolvePgPassword({ ...config, password: undefined });
        const pool = new pg.Pool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: token,
          ssl: pgSslOptions(config.sslMode),
          connectionTimeoutMillis: 15_000,
        });
        try {
          const role = config.user.replace(/"/g, '""');
          await pool.query(`ALTER ROLE "${role}" WITH PASSWORD $1`, [newPass]);
          console.log(`OK — senha definida para "${config.user}".`);
          console.log(`  .\\scripts\\set-postgres-user-env.ps1 -Password "<senha>"`);
          console.log(`  npm run lanza -- postgres check`);
        } finally {
          await pool.end();
        }
        break;
      }
      case "migrate": {
        const importJson = hasFlag(args, "--import-json");
        const dryRun = hasFlag(args, "--dry-run");
        await migratePostgres({ importJson, dryRun });
        if (!dryRun) console.log("Migração concluída.");
        break;
      }
      case "sync-store": {
        const file = args[1]?.trim();
        if (!file) {
          console.error("Informe o ficheiro: postgres sync-store contratos.json");
          process.exit(1);
        }
        await runSchemaMigration(false);
        const { imported, skipped } = await importJsonStores(false, [file]);
        if (skipped.length) {
          console.error(`Ficheiro não encontrado: ${skipped.join(", ")}`);
          process.exit(1);
        }
        console.log(`OK — espelhado no PostgreSQL: ${imported.join(", ")}`);
        break;
      }
      case "sync-all": {
        await runSchemaMigration(false);
        const { imported, skipped } = await importJsonStores(false);
        console.log(`OK — espelhados no PostgreSQL: ${imported.join(", ")}`);
        if (skipped.length) {
          console.log(`Ignorados (ficheiro ausente): ${skipped.join(", ")}`);
        }
        break;
      }
      default:
        console.error(`Subcomando desconhecido: ${sub}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof PgAuthError || msg.includes("Could not load credentials")) {
      console.error(e instanceof PgAuthError ? msg : (
        "Erro: credenciais AWS não encontradas para gerar token IAM.\n" +
          "  A role AWS_ROLE_ARN (Vercel OIDC) só funciona na Vercel.\n" +
          "  Use senha RDS:\n" +
          "    .\\scripts\\set-postgres-user-env.ps1 -PromptPassword"
      ));
    } else if (msg.includes("PostgreSQL não configurado")) {
      console.error(msg);
      console.error("  Execute: .\\scripts\\set-postgres-user-env.ps1");
    } else {
      console.error(e);
    }
    process.exit(1);
  } finally {
    await closePgPool();
  }
}
