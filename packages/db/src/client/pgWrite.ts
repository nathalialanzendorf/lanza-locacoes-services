import type pg from "pg";

import { ensureVercelPgPool, pgQuery } from "./PostgresPool.js";

/** @deprecated alias — prefer pgQuery (já garante pool Vercel). */
export function ensureVercelWritePool(): void {
  ensureVercelPgPool();
}

export async function pgWriteQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pgQuery<T>(text, params);
}
