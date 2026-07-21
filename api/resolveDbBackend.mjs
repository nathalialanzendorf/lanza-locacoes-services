/** Mesma lógica de packages/db/src/adapters/index.ts — sem importar server.mjs. */
const LANZA_PRODUCTION_PGHOST =
  "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com";
const LANZA_PRODUCTION_AWS_ROLE_ARN =
  "arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes";

function env(name) {
  const v = process.env[name];
  return v != null && v.trim() !== "" ? v.trim().toLowerCase() : undefined;
}

function vercelPostgresDefaultsEnabled() {
  if (!process.env.VERCEL) return false;
  const backend = process.env.LANZA_DB_BACKEND?.trim().toLowerCase();
  return backend !== "file";
}

function resolveAwsRoleArn() {
  const explicit = process.env.AWS_ROLE_ARN?.trim();
  if (explicit) return explicit;
  return vercelPostgresDefaultsEnabled() ? LANZA_PRODUCTION_AWS_ROLE_ARN : undefined;
}

function resolvePgHost() {
  const explicit = process.env.PGHOST?.trim();
  if (explicit) return explicit;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      return new URL(databaseUrl).hostname;
    } catch {
      /* ignore */
    }
  }

  if (vercelPostgresDefaultsEnabled() || (process.env.VERCEL && process.env.AWS_ROLE_ARN?.trim())) {
    return LANZA_PRODUCTION_PGHOST;
  }
  return undefined;
}

function postgresConfigured() {
  const hasHost = Boolean(resolvePgHost());
  const hasAuth = Boolean(
    env("PGPASSWORD") ?? process.env.PGPASSWORD?.trim() ?? resolveAwsRoleArn(),
  );
  return hasHost && hasAuth;
}

export function resolveDbBackend() {
  const raw = env("LANZA_DB_BACKEND");
  if (raw === "file") return "file";
  if (raw === "postgres" || raw === "dual") {
    return postgresConfigured() ? raw : "file";
  }
  if (postgresConfigured()) return "postgres";
  return "file";
}

export function postgresEnvConfigured() {
  return postgresConfigured();
}
