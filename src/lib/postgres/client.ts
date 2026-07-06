import pg from "pg";

import { resolvePgPassword } from "./auth.js";
import { getPgConfig, pgSslOptions } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let poolPasswordExpiresAt = 0;

/** Token IAM expira em ~15 min; renovamos com margem de 2 min. */
const IAM_TOKEN_TTL_MS = 13 * 60 * 1000;

async function buildPool(): Promise<pg.Pool> {
  const config = getPgConfig();
  const password = await resolvePgPassword(config);
  poolPasswordExpiresAt = Date.now() + IAM_TOKEN_TTL_MS;

  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password,
    ssl: pgSslOptions(config.sslMode),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

/** Pool partilhado; renova credencial IAM quando próximo de expirar. */
export async function getPgPool(): Promise<pg.Pool> {
  if (pool && Date.now() < poolPasswordExpiresAt) return pool;
  if (pool) await pool.end();
  pool = await buildPool();
  return pool;
}

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const p = await getPgPool();
  return p.query<T>(text, params);
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    poolPasswordExpiresAt = 0;
  }
}
