import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../repoRoot.js";
import { pgQuery } from "./client.js";

const SCHEMA_SQL = path.join(REPO_ROOT, "sql", "001_initial_schema.sql");

/** Ficheiros database/*.json importáveis para lanza.json_stores. */
export const JSON_STORE_FILES = [
  "clientes.json",
  "veiculos.json",
  "contratos.json",
  "locacoes.json",
  "cliente-despesas.json",
  "parceiro-despesas.json",
  "parceiros.json",
  "parceiro-veiculo.json",
  "infracoes.json",
  "analise-cadastro.json",
  "cliente-analise.json",
] as const;

export type MigrateOptions = {
  importJson?: boolean;
  dryRun?: boolean;
};

export async function runSchemaMigration(dryRun = false): Promise<void> {
  const sql = fs.readFileSync(SCHEMA_SQL, "utf8");
  if (dryRun) {
    console.log(`[dry-run] Executaria schema (${SCHEMA_SQL}, ${sql.length} bytes)`);
    return;
  }
  await pgQuery(sql);
}

export async function importJsonStores(dryRun = false): Promise<{ imported: string[]; skipped: string[] }> {
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const file of JSON_STORE_FILES) {
    const full = path.join(REPO_ROOT, "database", file);
    if (!fs.existsSync(full)) {
      skipped.push(file);
      continue;
    }
    const raw = fs.readFileSync(full, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const storeName = file.replace(/\.json$/, "");
    const description =
      typeof data.descricao === "string" ? data.descricao : `Importado de database/${file}`;

    if (dryRun) {
      console.log(`[dry-run] Importaria ${storeName} (${raw.length} bytes)`);
      imported.push(storeName);
      continue;
    }

    await pgQuery(
      `INSERT INTO lanza.json_stores (store_name, description, data, atualizado_em)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (store_name) DO UPDATE SET
         description = EXCLUDED.description,
         data = EXCLUDED.data,
         atualizado_em = now()`,
      [storeName, description, JSON.stringify(data)],
    );
    imported.push(storeName);
  }

  return { imported, skipped };
}

export async function migratePostgres(opts: MigrateOptions = {}): Promise<void> {
  await runSchemaMigration(opts.dryRun);
  if (opts.importJson) {
    const { imported, skipped } = await importJsonStores(opts.dryRun);
    console.log(`Importados: ${imported.join(", ") || "(nenhum)"}`);
    if (skipped.length) console.log(`Ausentes (ignorados): ${skipped.join(", ")}`);
  }
}

/** Lê um store pelo nome (ex.: "clientes"). */
export async function loadJsonStore<T = Record<string, unknown>>(storeName: string): Promise<T | null> {
  const res = await pgQuery<{ data: T }>(
    `SELECT data FROM lanza.json_stores WHERE store_name = $1`,
    [storeName],
  );
  return res.rows[0]?.data ?? null;
}

/** Grava store completo (upsert). */
export async function saveJsonStore(
  storeName: string,
  data: Record<string, unknown>,
  description?: string,
): Promise<void> {
  await pgQuery(
    `INSERT INTO lanza.json_stores (store_name, description, data, atualizado_em)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (store_name) DO UPDATE SET
       description = COALESCE(EXCLUDED.description, lanza.json_stores.description),
       data = EXCLUDED.data,
       atualizado_em = now()`,
    [storeName, description ?? null, JSON.stringify(data)],
  );
}
