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

function pamAuthHelp(configPassword?: string): string {
  const looksLikeIamToken =
    !!configPassword &&
    (configPassword.includes("X-Amz-Algorithm") || configPassword.includes("Action=connect"));
  const lines = [
    "Autenticação RDS falhou (PAM / IAM).",
    "",
    looksLikeIamToken
      ? "  PGPASSWORD parece ser um token IAM — expira em ~15 min."
      : "  PGPASSWORD parece ser senha estática, mas o utilizador postgres pode estar só com IAM.",
    "",
    "  Token IAM (temporário, ~15 min):",
    "    .\\scripts\\postgres-console-token.ps1 -Check",
    "    (cole a string completa do console AWS — começa com o hostname)",
    "",
    "  Definir senha estática permanente (1×, com token IAM válido):",
    "    .\\scripts\\postgres-console-token.ps1 -SetPassword \"SuaSenhaSegura\"",
    "",
    "  Depois disso, use sempre:",
    "    .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
  ];
  return lines.join("\n");
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    const pgCode = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
    if (e instanceof PgAuthError || msg.includes("Could not load credentials")) {
      console.error(
        e instanceof PgAuthError
          ? msg
          : "Erro: credenciais AWS não encontradas.\n" +
              "  Use: .\\scripts\\postgres-console-token.ps1 -Check",
      );
    } else if (msg.includes("PAM authentication failed") || pgCode === "28P01") {
      let passwordHint: string | undefined;
      try {
        passwordHint = getPgConfig().password;
      } catch {
        /* ignore */
      }
      console.error(pamAuthHelp(passwordHint));
    } else if (msg.includes("PostgreSQL não configurado")) {
      console.error(msg);
      console.error("  Execute: .\\scripts\\set-postgres-user-env.ps1");
    } else {
      console.error(e);
    }
    process.exit(1);
  })
  .finally(() => closePgPool());
