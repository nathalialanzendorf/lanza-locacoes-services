/**
 * Pedágio ← Pedágio Digital
 *
 * - **Categoria** do débito em cliente-despesas.json: `Pedágio`
 * - **Portal** (fonte dos dados): Pedágio Digital — pedagiodigital.com
 */
export {
  CATEGORIA_PEDAGIO,
  CATEGORIA_PEDAGIO_ALIAS,
} from "./despesaCategorias.js";

import { CATEGORIA_PEDAGIO, CATEGORIA_PEDAGIO_ALIAS } from "./despesaCategorias.js";

/** Rótulo do portal pedagiodigital.com — não é a categoria do débito. */
export const ROTULO_PEDAGIO_DIGITAL = "Pedágio Digital";

/** @deprecated Use CATEGORIA_PEDAGIO */
export const CATEGORIA_PEDAGIO_DIGITAL = CATEGORIA_PEDAGIO_ALIAS;

/** @deprecated Use CATEGORIA_PEDAGIO */
export const CATEGORIA_PEDAGIO_LEGADO = CATEGORIA_PEDAGIO;

export function isCategoriaPedagio(categoria: string | undefined | null): boolean {
  const c = (categoria ?? "").trim();
  return c === CATEGORIA_PEDAGIO || c === CATEGORIA_PEDAGIO_ALIAS;
}

/** Reescreve categoria legada `Pedágio Digital` → `Pedágio` no database local. */
export async function normalizarCategoriaPedagioNoDb(opts?: {
  dryRun?: boolean;
}): Promise<{ atualizados: number; exemplos: string[] }> {
  const { loadClienteDespesasDb, saveClienteDespesasDb } = await import("./clienteDespesasDb.js");
  const db = loadClienteDespesasDb();
  let atualizados = 0;
  const exemplos: string[] = [];

  for (const m of db.clienteDespesas) {
    if (m.ativo === false) continue;
    if ((m.categoria ?? "").trim() !== CATEGORIA_PEDAGIO_ALIAS) continue;
    if (exemplos.length < 3) {
      exemplos.push(`${m.autoInfracao ?? m.id}: ${CATEGORIA_PEDAGIO_ALIAS} → ${CATEGORIA_PEDAGIO}`);
    }
    if (!opts?.dryRun) {
      m.categoria = CATEGORIA_PEDAGIO;
      m.atualizadoEm = new Date().toISOString();
    }
    atualizados++;
  }

  if (!opts?.dryRun && atualizados > 0) saveClienteDespesasDb(db);
  return { atualizados, exemplos };
}
