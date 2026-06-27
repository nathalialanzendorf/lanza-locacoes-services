/**
 * Helpers partilhados para dedupe antes de POST no Rastreame.
 */
import type { GastoRecord } from "./gasto.js";
import { refKey } from "./placaRastreavel.js";

export function gastoDuplicado(
  gastos: GastoRecord[],
  motoristaKey: string,
  rastreavelKey: string,
  info: string,
): GastoRecord | null {
  const inf = info.trim();
  for (const g of gastos) {
    const mk = refKey(g.motorista as { key?: string; id?: string | number });
    const rk = refKey(g.rastreavel as { key?: string; id?: string | number });
    if (mk === motoristaKey && rk === rastreavelKey && String(g.info ?? "").trim() === inf) {
      return g;
    }
  }
  return null;
}
