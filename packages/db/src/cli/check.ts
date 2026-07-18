import { closePgPool, pgQuery } from "../client/PostgresPool.js";
import { PgAuthError } from "../auth/iam.js";
import { getPgConfig } from "../config.js";

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  const json = hasFlag(process.argv, "--json");
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
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof PgAuthError || msg.includes("Could not load credentials")) {
      console.error(
        e instanceof PgAuthError
          ? msg
          : "Erro: credenciais AWS não encontradas.\n" +
              "  Use: .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
      );
    } else if (msg.includes("PostgreSQL não configurado")) {
      console.error(msg);
      console.error("  Execute: .\\scripts\\set-postgres-user-env.ps1");
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => closePgPool());
