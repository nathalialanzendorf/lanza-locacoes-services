/** Configuração PostgreSQL (RDS AWS) a partir de variáveis de ambiente. */

export type PgSslMode = "disable" | "prefer" | "require" | "verify-full";

export type PgConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  sslMode: PgSslMode;
  /** Senha estática (PGPASSWORD). Se ausente, usa token IAM via RDS Signer. */
  password?: string;
  awsRegion?: string;
  awsRoleArn?: string;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v != null && v.trim() !== "" ? v.trim() : undefined;
}

function parseSslMode(raw: string | undefined): PgSslMode {
  const v = (raw ?? "require").toLowerCase();
  if (v === "disable" || v === "prefer" || v === "require" || v === "verify-full") {
    return v;
  }
  return "require";
}

function parseDatabaseUrl(url: string): PgConfig {
  const u = new URL(url);
  const sslMode = parseSslMode(u.searchParams.get("sslmode") ?? env("PGSSLMODE"));
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(u.username),
    password: u.password ? decodeURIComponent(u.password) : env("PGPASSWORD"),
    sslMode,
    awsRegion: env("AWS_REGION"),
    awsRoleArn: env("AWS_ROLE_ARN"),
  };
}

/** Lê PGHOST/PGPORT/… ou DATABASE_URL. */
export function getPgConfig(): PgConfig {
  const databaseUrl = env("DATABASE_URL");
  if (databaseUrl) return parseDatabaseUrl(databaseUrl);

  const host = env("PGHOST");
  if (!host) {
    throw new Error(
      "PostgreSQL não configurado: defina PGHOST (ou DATABASE_URL). " +
        "Use .\\scripts\\set-postgres-user-env.ps1",
    );
  }

  return {
    host,
    port: Number(env("PGPORT") ?? "5432"),
    database: env("PGDATABASE") ?? "postgres",
    user: env("PGUSER") ?? "postgres",
    password: env("PGPASSWORD"),
    sslMode: parseSslMode(env("PGSSLMODE")),
    awsRegion: env("AWS_REGION"),
    awsRoleArn: env("AWS_ROLE_ARN"),
  };
}

export function pgSslOptions(sslMode: PgSslMode): false | { rejectUnauthorized: boolean } {
  if (sslMode === "disable") return false;
  return { rejectUnauthorized: sslMode === "verify-full" };
}
