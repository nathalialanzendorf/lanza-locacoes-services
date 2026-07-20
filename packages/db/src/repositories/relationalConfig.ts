import { pgQuery } from "../client/PostgresPool.js";
import { getDbBackend } from "../adapters/index.js";

/** Postgres relacional activo (desactivar com LANZA_DB_READ_LEGACY=1 ou LANZA_DB_RELATIONAL=0). */
export async function useRelationalStore(): Promise<boolean> {
  if (process.env.LANZA_DB_READ_LEGACY === "1") return false;
  if (process.env.LANZA_DB_RELATIONAL === "0") return false;
  if (getDbBackend() === "file") return false;
  try {
    await pgQuery("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export function skipJsonStoresWrite(): boolean {
  return process.env.LANZA_DB_READ_LEGACY !== "1" && process.env.LANZA_DB_RELATIONAL !== "0";
}
