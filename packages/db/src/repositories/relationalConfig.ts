import { pgQuery } from "../client/PostgresPool.js";
import { getDbBackend } from "../adapters/index.js";
import { ReadOnlyBackendError } from "../util/readOnlyBackendError.js";

let relationalStoreCached: boolean | null = null;

/** Postgres relacional activo (desactivar com LANZA_DB_READ_LEGACY=1 ou LANZA_DB_RELATIONAL=0). */
export async function useRelationalStore(): Promise<boolean> {
  if (process.env.LANZA_DB_READ_LEGACY === "1") return false;
  if (process.env.LANZA_DB_RELATIONAL === "0") return false;
  if (getDbBackend() === "file") return false;
  if (relationalStoreCached === true) return true;
  if (skipJsonStoresWrite() && getDbBackend() !== "file") {
    relationalStoreCached = true;
    return true;
  }
  try {
    await pgQuery("SELECT 1", undefined, "useRelationalStore");
    relationalStoreCached = true;
    return true;
  } catch {
    return false;
  }
}

/** Falha se PostgreSQL relacional não estiver disponível para gravação. */
export async function assertRelationalStore(): Promise<void> {
  if (!(await useRelationalStore())) {
    throw new ReadOnlyBackendError(
      "Gravação indisponível: configure PostgreSQL (PGHOST, PGPASSWORD ou AWS_ROLE_ARN) " +
        "e LANZA_DB_BACKEND=postgres. Gravação em JSON foi desactivada.",
    );
  }
}

export function resetRelationalStoreCache(): void {
  relationalStoreCached = null;
}

/** Abre uma conexão antes de queries paralelas (evita hang no cold start Vercel/RDS). */
export async function warmupPgPool(): Promise<void> {
  if (!(await useRelationalStore())) return;
  await pgQuery("SELECT 1", undefined, "warmupPgPool");
}

export function skipJsonStoresWrite(): boolean {
  return process.env.LANZA_DB_READ_LEGACY !== "1" && process.env.LANZA_DB_RELATIONAL !== "0";
}
