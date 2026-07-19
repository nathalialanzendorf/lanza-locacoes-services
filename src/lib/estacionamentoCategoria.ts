/**
 * Estacionamento ← SigaPay
 *
 * - **Categoria** do débito em cliente-despesas.json: `Estacionamento`
 * - **Portal** (fonte dos dados): SigaPay — Zona Azul Brasil
 */
import {
  loadClienteDespesasDb,
  saveClienteDespesasDb,
} from "./clienteDespesasDb.js";

/** Categoria em cliente-despesas.json (débito de estacionamento rotativo). */
export const CATEGORIA_ESTACIONAMENTO = "Estacionamento";

/** Rótulo do portal/app SigaPay — não é a categoria do débito. */
export const ROTULO_SIGAPAY = "SigaPay";

/** @deprecated Use ROTULO_SIGAPAY */
export const ROTULO_ESTACIONAMENTO_SIGAPAY = ROTULO_SIGAPAY;

/** Valores legados gravados como categoria — normalizar para `Estacionamento`. */
export const CATEGORIA_ESTACIONAMENTO_ALIASES = [
  "Estacionamento rotativo SigaPay",
  "SigaPay",
] as const;

/** @deprecated */
export const CATEGORIA_ESTACIONAMENTO_ALIAS = "Estacionamento rotativo SigaPay";

/** @deprecated Use CATEGORIA_ESTACIONAMENTO */
export const CATEGORIA_ESTACIONAMENTO_ROTATIVO = CATEGORIA_ESTACIONAMENTO_ALIAS;

/** @deprecated Use CATEGORIA_ESTACIONAMENTO */
export const CATEGORIA_ESTACIONAMENTO_LEGADO = CATEGORIA_ESTACIONAMENTO;

export function isCategoriaEstacionamento(categoria: string | undefined | null): boolean {
  const c = (categoria ?? "").trim();
  if (c === CATEGORIA_ESTACIONAMENTO) return true;
  return (CATEGORIA_ESTACIONAMENTO_ALIASES as readonly string[]).includes(c);
}

function categoriaEstacionamentoLegada(categoria: string): boolean {
  return (CATEGORIA_ESTACIONAMENTO_ALIASES as readonly string[]).includes(categoria);
}

/** Reescreve categoria legada → `Estacionamento` no database local. */
export function normalizarCategoriaEstacionamentoNoDb(opts?: {
  dryRun?: boolean;
}): { atualizados: number; exemplos: string[] } {
  const db = loadClienteDespesasDb();
  let atualizados = 0;
  const exemplos: string[] = [];

  for (const m of db.clienteDespesas) {
    if (m.ativo === false) continue;
    if (!categoriaEstacionamentoLegada((m.categoria ?? "").trim())) continue;
    const de = (m.categoria ?? "").trim();
    if (exemplos.length < 3) {
      exemplos.push(`${m.autoInfracao ?? m.id}: ${de} → ${CATEGORIA_ESTACIONAMENTO}`);
    }
    if (!opts?.dryRun) {
      m.categoria = CATEGORIA_ESTACIONAMENTO;
      m.atualizadoEm = new Date().toISOString();
    }
    atualizados++;
  }

  if (!opts?.dryRun && atualizados > 0) saveClienteDespesasDb(db);
  return { atualizados, exemplos };
}
