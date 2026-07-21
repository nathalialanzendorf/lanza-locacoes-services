/** Mesma lógica de packages/db/src/adapters/index.ts — sem importar server.mjs. */
const LANZA_PRODUCTION_PGHOST =
  "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com";

function env(name) {
  const v = process.env[name];
  return v != null && v.trim() !== "" ? v.trim().toLowerCase() : undefined;
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

  if (process.env.VERCEL && env("AWS_ROLE_ARN")) return LANZA_PRODUCTION_PGHOST;
  return undefined;
}

function postgresConfigured() {
  const hasHost = Boolean(resolvePgHost());
  const hasAuth = Boolean(
    env("PGPASSWORD") ??
      process.env.PGPASSWORD?.trim() ??
      env("AWS_ROLE_ARN") ??
      process.env.AWS_ROLE_ARN?.trim(),
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
