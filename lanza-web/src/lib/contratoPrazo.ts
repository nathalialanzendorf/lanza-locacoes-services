import { brToIsoDate, isoDateToBr } from "@/lib/dateBr";
import { hojeIsoBr } from "@/lib/contratoVencimento";

export const PERIODOS_CONTRATO = [
  { value: "semana", label: "1 semana", dias: 7 },
  { value: "15 dias", label: "15 dias", dias: 15 },
  { value: "3 meses", label: "3 meses", dias: 90 },
  { value: "6 meses", label: "6 meses", dias: 180 },
  { value: "1 ano", label: "1 ano", dias: 365 },
] as const;

export type PeriodoContratoValue = (typeof PERIODOS_CONTRATO)[number]["value"];

const PERIODO_DIAS: Record<string, number> = Object.fromEntries(
  PERIODOS_CONTRATO.map((p) => [p.value, p.dias]),
);

export function hojeDataBr(): string {
  return isoDateToBr(hojeIsoBr());
}

export function periodoParaDias(periodo: string): number | null {
  const key = periodo.trim().toLowerCase();
  const dias = PERIODO_DIAS[key];
  return dias ?? null;
}

/** Mapeia duração em dias para a opção padrão do select, se houver correspondência exata. */
export function periodoDeDias(dias: number): PeriodoContratoValue | "" {
  const n = Math.round(dias);
  const match = PERIODOS_CONTRATO.find((p) => p.dias === n);
  return match?.value ?? "";
}

export function somarDiasDataBr(inicioBr: string, dias: number): string {
  const iso = brToIsoDate(inicioBr);
  if (!iso || !Number.isFinite(dias)) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + Math.round(dias));
  return isoDateToBr(d.toISOString().slice(0, 10));
}

export function diasEntreDatasBr(inicioBr: string, fimBr: string): number | null {
  const ini = brToIsoDate(inicioBr);
  const fim = brToIsoDate(fimBr);
  if (!ini || !fim) return null;
  const a = new Date(`${ini}T12:00:00`);
  const b = new Date(`${fim}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function dataFimDePeriodo(inicioBr: string, periodo: string): string {
  const dias = periodoParaDias(periodo);
  if (!dias) return "";
  return somarDiasDataBr(inicioBr, dias);
}
