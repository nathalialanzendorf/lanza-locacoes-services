import type pg from "pg";

import { createVercelPostgresPool } from "../auth/vercel.js";
import { getDbBackend } from "../adapters/index.js";
import { getVercelPostgresPool, pgQuery, setVercelPostgresPool } from "./PostgresPool.js";

/** Garante pool Vercel (OIDC) antes de gravações na serverless. */
export function ensureVercelWritePool(): void {
  if (!process.env.VERCEL || getDbBackend() === "file") return;
  if (getVercelPostgresPool()) return;
  setVercelPostgresPool(createVercelPostgresPool());
}

/**
 * Gravações PostgreSQL — na Vercel usa sempre o pool OIDC (@vercel/functions),
 * evitando gravações silenciosas via adapter de ficheiro ou pool local incorreto.
 */
export async function pgWriteQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  if (process.env.VERCEL && getDbBackend() !== "file") {
    ensureVercelWritePool();
    const pool = getVercelPostgresPool();
    if (!pool) {
      throw new Error("Pool Postgres Vercel indisponível para gravação");
    }
    return pool.query<T>(text, params);
  }
  return pgQuery<T>(text, params);
}
