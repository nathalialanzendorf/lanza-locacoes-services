import type { ContratoRegistro } from "./contratosDb.js";
import { contratoAtivoOperacional } from "./contratosDb.js";

export const PROXIMO_VENCER_DIAS = 14;

export type AlertaVencimentoContrato = "vencido" | "proximo";

/** Campos mínimos para tabelas do dashboard — evita serializar snapshots completos do contrato. */
export type ContratoVencimentoResumo = {
  id: string;
  clienteId?: string | null;
  clienteNome?: string | null;
  placa?: string | null;
  dataFimPrevista?: string | null;
  veiculo?: { placa?: string | null };
};

export function contratoVencimentoResumoDto(c: ContratoRegistro): ContratoVencimentoResumo {
  const placa = c.placa?.trim() || c.veiculo?.placa?.trim() || null;
  return {
    id: c.id,
    clienteId: c.clienteId ?? null,
    clienteNome: c.clienteNome ?? null,
    placa,
    dataFimPrevista: dataFimPrevistaContrato(c),
    ...(placa ? { veiculo: { placa } } : {}),
  };
}

export function hojeIsoBr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dataFimPrevistaContrato(
  c: Pick<ContratoRegistro, "dataFimPrevista">,
): string | null {
  return c.dataFimPrevista?.trim() || null;
}

function brToIsoDate(s: string): string | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
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

function prioridadeRenovacao(c: ContratoRegistro, hojeIso = hojeIsoBr()): number {
  const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
  if (alerta === "vencido") return 0;
  if (alerta === "proximo") return 1;
  return 2;
}

export function ordenarContratosRenovacao(
  a: ContratoRegistro,
  b: ContratoRegistro,
  hojeIso = hojeIsoBr(),
): number {
  const pa = prioridadeRenovacao(a, hojeIso);
  const pb = prioridadeRenovacao(b, hojeIso);
  if (pa !== pb) return pa - pb;
  const fa = brToIsoDate(dataFimPrevistaContrato(a) ?? "") || "9999-12-31";
  const fb = brToIsoDate(dataFimPrevistaContrato(b) ?? "") || "9999-12-31";
  return fa.localeCompare(fb);
}

export function listarContratosVencimentoDashboard(
  contratos: ContratoRegistro[],
  hojeIso = hojeIsoBr(),
): { vencidos: ContratoVencimentoResumo[]; aVencer: ContratoVencimentoResumo[] } {
  const vencidos: ContratoRegistro[] = [];
  const aVencer: ContratoRegistro[] = [];

  for (const c of contratos) {
    if (!contratoAtivoOperacional(c)) continue;
    const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
    if (alerta === "vencido") vencidos.push(c);
    else if (alerta === "proximo") aVencer.push(c);
  }

  vencidos.sort((a, b) => ordenarContratosRenovacao(a, b, hojeIso));
  aVencer.sort((a, b) => ordenarContratosRenovacao(a, b, hojeIso));
  return {
    vencidos: vencidos.map(contratoVencimentoResumoDto),
    aVencer: aVencer.map(contratoVencimentoResumoDto),
  };
}
