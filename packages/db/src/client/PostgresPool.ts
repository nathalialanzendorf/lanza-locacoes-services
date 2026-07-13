import pg from "pg";

import { resolvePgPassword } from "../auth/iam.js";
import { getPgConfig, pgSslOptions, type PgConfig } from "../config.js";

const { Pool } = pg;

/** Token IAM expira em ~15 min; renovamos com margem de 2 min. */
const IAM_TOKEN_TTL_MS = 13 * 60 * 1000;

export type PostgresPoolOptions = {
  config?: PgConfig;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
};

/**
 * Gerencia conexão PostgreSQL com pool partilhado.
 * Renova credencial IAM automaticamente quando próximo de expirar.
 */
export class PostgresPool {
  private pool: pg.Pool | null = null;
  private passwordExpiresAt = 0;
  private readonly config: PgConfig;
  private readonly poolOptions: Omit<PostgresPoolOptions, "config">;

  constructor(options: PostgresPoolOptions = {}) {
    this.config = options.config ?? getPgConfig();
    this.poolOptions = {
      max: options.max ?? 5,
      idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
      connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
    };
  }

  getConfig(): PgConfig {
    return this.config;
  }

  private async buildPool(): Promise<pg.Pool> {
    const password = await resolvePgPassword(this.config);
    this.passwordExpiresAt = Date.now() + IAM_TOKEN_TTL_MS;

    return new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password,
      ssl: pgSslOptions(this.config.sslMode),
      max: this.poolOptions.max,
      idleTimeoutMillis: this.poolOptions.idleTimeoutMillis,
      connectionTimeoutMillis: this.poolOptions.connectionTimeoutMillis,
    });
  }

  async getPool(): Promise<pg.Pool> {
    if (this.pool && Date.now() < this.passwordExpiresAt) return this.pool;
    if (this.pool) await this.pool.end();
    this.pool = await this.buildPool();
    return this.pool;
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    const p = await this.getPool();
    return p.query<T>(text, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.passwordExpiresAt = 0;
    }
  }
}

/** Instância singleton para CLI e scripts locais. */
let defaultPool: PostgresPool | null = null;

export function getDefaultPostgresPool(): PostgresPool {
  if (!defaultPool) defaultPool = new PostgresPool();
  return defaultPool;
}

export async function getPgPool(): Promise<pg.Pool> {
  return getDefaultPostgresPool().getPool();
}

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getDefaultPostgresPool().query<T>(text, params);
}

export async function closePgPool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.close();
    defaultPool = null;
  }
}
