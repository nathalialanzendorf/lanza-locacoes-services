import { closePgPool, getPgConfig, migratePostgres, pgQuery } from "../lib/postgres/index.js";

const HELP = `postgres — conexão PostgreSQL (RDS AWS)

Subcomandos:
  check [--json]              Testa conexão (SELECT version(), current_database())
  migrate [--import-json] [--dry-run]
                              Cria schema lanza.json_stores; opcionalmente importa database/*.json

Alternativa via pacote @lanza/db:
  npm run db:check
  npm run db:migrate -- --import-json

Variáveis (persistentes do utilizador — ver .\\scripts\\set-postgres-user-env.ps1):
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGSSLMODE
  PGPASSWORD                  (opcional — senha estática; senão usa token IAM)
  AWS_REGION, AWS_ROLE_ARN    (autenticação IAM no RDS)
  DATABASE_URL                (alternativa única às PG*)
  LANZA_DB_BACKEND            file (padrão) | dual | postgres — backend dos *Db.ts

Pré-requisitos:
  - Credenciais AWS locais (perfil/cadeia padrão) com permissão de assumir AWS_ROLE_ARN
  - Utilizador PostgreSQL com role rds_iam (quando sem PGPASSWORD)
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
      case "migrate": {
        const importJson = hasFlag(args, "--import-json");
        const dryRun = hasFlag(args, "--dry-run");
        await migratePostgres({ importJson, dryRun });
        if (!dryRun) console.log("Migração concluída.");
        break;
      }
      default:
        console.error(`Subcomando desconhecido: ${sub}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Could not load credentials")) {
      console.error(
        "Erro: credenciais AWS não encontradas para gerar token IAM.\n" +
          "  Opção A — configure AWS CLI/perfil (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY)\n" +
          "            com permissão de assumir AWS_ROLE_ARN.\n" +
          "  Opção B — use senha estática:\n" +
          "            .\\scripts\\set-postgres-user-env.ps1 -Password \"<senha>\"",
      );
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
