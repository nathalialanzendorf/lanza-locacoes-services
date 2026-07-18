import { brToIsoDate } from "@/lib/dateBr";
import type { Contrato } from "@/api/types";

/** Dias até o fim previsto para marcar como “próximo de vencer”. */
export const PROXIMO_VENCER_DIAS = 14;

export type AlertaVencimentoContrato = "vencido" | "proximo";

export function hojeIsoBr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dataFimPrevistaContrato(
  c: Pick<Contrato, "dataFimPrevista" | "dataFim">,
): string | null {
  return c.dataFimPrevista?.trim() || c.dataFim?.trim() || null;
}

function diasAteIso(fimIso: string, hojeIso: string): number {
  const hoje = new Date(`${hojeIso}T12:00:00`);
  const fim = new Date(`${fimIso}T12:00:00`);
  return Math.round((fim.getTime() - hoje.getTime()) / 86_400_000);
}

export function alertaVencimentoContrato(
  dataFim: string | null | undefined,
  hojeIso = hojeIsoBr(),
): AlertaVencimentoContrato | null {
  const fimIso = brToIsoDate(String(dataFim ?? ""));
  if (!fimIso) return null;
  const dias = diasAteIso(fimIso, hojeIso);
  if (dias < 0) return "vencido";
  if (dias <= PROXIMO_VENCER_DIAS) return "proximo";
  return null;
}

export function prioridadeRenovacao(c: Contrato, hojeIso = hojeIsoBr()): number {
  const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
  if (alerta === "vencido") return 0;
  if (alerta === "proximo") return 1;
  return 2;
}

export function ordenarContratosRenovacao(a: Contrato, b: Contrato, hojeIso = hojeIsoBr()): number {
  const pa = prioridadeRenovacao(a, hojeIso);
  const pb = prioridadeRenovacao(b, hojeIso);
  if (pa !== pb) return pa - pb;
  const fa = brToIsoDate(dataFimPrevistaContrato(a) ?? "") || "9999-12-31";
  const fb = brToIsoDate(dataFimPrevistaContrato(b) ?? "") || "9999-12-31";
  return fa.localeCompare(fb);
}

export function rotuloAlertaVencimento(
  dataFim: string | null | undefined,
  hojeIso = hojeIsoBr(),
): string | null {
  const fimIso = brToIsoDate(String(dataFim ?? ""));
  if (!fimIso) return null;
  const dias = diasAteIso(fimIso, hojeIso);
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "Vence hoje";
  if (dias <= PROXIMO_VENCER_DIAS) return `Vence em ${dias} dia(s)`;
  return null;
}

export function rowClassVencimentoContrato(c: Contrato, hojeIso = hojeIsoBr()): string | undefined {
  const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
  if (alerta === "vencido") return "row--vencido";
  if (alerta === "proximo") return "row--proximo-vencer";
  return undefined;
}
