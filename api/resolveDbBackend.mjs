/** Mesma lógica de packages/db/src/adapters/index.ts — sem importar server.mjs. */
function env(name) {
  const v = process.env[name];
  return v != null && v.trim() !== "" ? v.trim().toLowerCase() : undefined;
}

function postgresConfigured() {
  const hasHost = Boolean(env("PGHOST") ?? process.env.DATABASE_URL?.trim());
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
  if (raw === "postgres" || raw === "dual" || raw === "file") return raw;
  if (postgresConfigured()) return "postgres";
  return "file";
}

export function postgresEnvConfigured() {
  return postgresConfigured();
}
