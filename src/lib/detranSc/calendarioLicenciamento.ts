import { compactPlaca } from "../placa.js";

/** Calendário DETRAN SC — vencimento do licenciamento anual por final de placa. */
const VENCIMENTO_MMDD: Record<number, string> = {
  1: "03-31",
  2: "04-30",
  3: "05-31",
  4: "06-30",
  5: "07-31",
  6: "08-31",
  7: "09-30",
  8: "10-31",
  9: "11-30",
  0: "12-30",
};

/** Final da placa (0–9) a partir de `ABC-1D23` ou `ABC1D23`. */
export function finalPlaca(placa: string): number {
  const d = compactPlaca(placa).replace(/\D/g, "");
  if (!d) return 0;
  return Number(d.slice(-1)) % 10;
}

/**
 * Data de vencimento do licenciamento (ISO `YYYY-MM-DD`) conforme tabela DETRAN SC
 * para o exercício informado (ex.: `exercicioLicenciamento` da consulta).
 */
export function vencimentoLicenciamentoDetranSc(
  placa: string,
  exercicio: number,
): string {
  const fim = finalPlaca(placa);
  const mmdd = VENCIMENTO_MMDD[fim] ?? "12-30";
  return `${exercicio}-${mmdd}`;
}
