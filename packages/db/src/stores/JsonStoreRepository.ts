import type { PostgresPool } from "../client/PostgresPool.js";
import { getDefaultPostgresPool } from "../client/PostgresPool.js";

/**
 * Repositório de documentos JSONB em `lanza.json_stores`.
 * Cada store corresponde a um ficheiro `database/*.json`.
 */
export class JsonStoreRepository {
  constructor(private readonly pool: PostgresPool) {}

  async load<T = Record<string, unknown>>(storeName: string): Promise<T | null> {
    const res = await this.pool.query<{ data: T }>(
      `SELECT data FROM lanza.json_stores WHERE store_name = $1`,
      [storeName],
    );
    return res.rows[0]?.data ?? null;
  }

  async save(
    storeName: string,
    data: Record<string, unknown>,
    description?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO lanza.json_stores (store_name, description, data, atualizado_em)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (store_name) DO UPDATE SET
         description = COALESCE(EXCLUDED.description, lanza.json_stores.description),
         data = EXCLUDED.data,
         atualizado_em = now()`,
      [storeName, description ?? null, JSON.stringify(data)],
    );
  }

  async exists(storeName: string): Promise<boolean> {
    const res = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM lanza.json_stores WHERE store_name = $1) AS exists`,
      [storeName],
    );
    return res.rows[0]?.exists ?? false;
  }

  async list(): Promise<string[]> {
    const res = await this.pool.query<{ store_name: string }>(
      `SELECT store_name FROM lanza.json_stores ORDER BY store_name`,
    );
    return res.rows.map((r) => r.store_name);
  }

  async delete(storeName: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM lanza.json_stores WHERE store_name = $1`, [
      storeName,
    ]);
    return (res.rowCount ?? 0) > 0;
  }
}

/** Funções de conveniência sobre o pool singleton. */
export async function loadJsonStore<T = Record<string, unknown>>(
  storeName: string,
): Promise<T | null> {
  return new JsonStoreRepository(getDefaultPostgresPool()).load<T>(storeName);
}

export async function saveJsonStore(
  storeName: string,
  data: Record<string, unknown>,
  description?: string,
): Promise<void> {
  await new JsonStoreRepository(getDefaultPostgresPool()).save(storeName, data, description);
}
