const TZ_BR = "America/Sao_Paulo";

/** Data de hoje no fuso operacional (DD/MM/AAAA). */
export function hojeBr(timeZone = TZ_BR): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${day}/${month}/${year}`;
}

/** Dia da semana (0=dom … 6=sáb) no fuso operacional. */
export function hojeDowBr(timeZone = TZ_BR): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? new Date().getDay();
}

const DIAS_SEMANA_BR = [
  "DOMINGO",
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
  "SÁBADO",
] as const;

/** Nome do dia da semana em PT-BR maiúsculas (ex.: SÁBADO). */
export function nomeDiaSemanaBr(dow = hojeDowBr(), timeZone = TZ_BR): string {
  void timeZone;
  return DIAS_SEMANA_BR[dow] ?? DIAS_SEMANA_BR[hojeDowBr()];
}

export type PeriodoBr = {
  dataInicial?: string;
  dataFinal?: string;
};

function parseDataBrDia(s: string): Date | null {
  const m = String(s ?? "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Extrai o dia civil de strings DD/MM/AAAA ou ISO (YYYY-MM-DD…). */
export function parseDataBrOuIsoDia(s: string): Date | null {
  const br = parseDataBrDia(s);
  if (br) return br;
  const iso = String(s ?? "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Período inclusivo (DD/MM/AAAA). Sem datas → passa tudo; data inválida → exclui. */
export function dataStringNoPeriodo(dataStr: string | null | undefined, periodo: PeriodoBr = {}): boolean {
  if (!periodo.dataInicial?.trim() && !periodo.dataFinal?.trim()) return true;
  const dt = parseDataBrOuIsoDia(String(dataStr ?? ""));
  if (!dt) return false;
  const ini = periodo.dataInicial?.trim() ? parseDataBrDia(periodo.dataInicial) : null;
  const fim = periodo.dataFinal?.trim() ? parseDataBrDia(periodo.dataFinal) : null;
  if (ini && dt < ini) return false;
  if (fim) {
    const fimFim = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999);
    if (dt > fimFim) return false;
  }
  return true;
}

/** Competência MM/AAAA a partir de DD/MM/AAAA. */
export function competenciaDeDataBr(dataBr: string): string | null {
  const m = String(dataBr ?? "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[2]!.padStart(2, "0")}/${m[3]}`;
}

/** Último dia do mês de uma data DD/MM/AAAA. */
export function ultimoDiaMesBr(dataBr: string): string | null {
  const dt = parseDataBrDia(dataBr);
  if (!dt) return null;
  const ultimo = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  return `${String(ultimo.getDate()).padStart(2, "0")}/${String(ultimo.getMonth() + 1).padStart(2, "0")}/${ultimo.getFullYear()}`;
}

function parseDataBrDiaFim(s: string): Date | null {
  const ini = parseDataBrDia(s);
  if (!ini) return null;
  return new Date(ini.getFullYear(), ini.getMonth(), ini.getDate(), 23, 59, 59, 999);
}

/** Intervalo [inicioStr, fimStr] intersecta o período do filtro (fimStr vazio = aberto). */
export function intervaloBrIntersectaPeriodo(
  inicioStr: string | null | undefined,
  fimStr: string | null | undefined,
  periodo: PeriodoBr = {},
): boolean {
  if (!periodo.dataInicial?.trim() && !periodo.dataFinal?.trim()) return true;
  const ini = parseDataBrOuIsoDia(String(inicioStr ?? ""));
  if (!ini) return false;
  const fim = fimStr?.trim() ? parseDataBrDiaFim(fimStr) : null;
  const filtroIni = periodo.dataInicial?.trim() ? parseDataBrDia(periodo.dataInicial) : null;
  const filtroFim = periodo.dataFinal?.trim() ? parseDataBrDiaFim(periodo.dataFinal) : null;
  if (filtroFim && ini > filtroFim) return false;
  if (filtroIni && fim && fim < filtroIni) return false;
  return true;
}

export function periodoValido(periodo: PeriodoBr): boolean {
  const ini = periodo.dataInicial?.trim();
  const fim = periodo.dataFinal?.trim();
  if (!ini && !fim) return true;
  if (ini && !parseDataBrDia(ini)) return false;
  if (fim && !parseDataBrDia(fim)) return false;
  if (ini && fim) {
    const a = parseDataBrDia(ini)!;
    const b = parseDataBrDia(fim)!;
    return a.getTime() <= b.getTime();
  }
  return true;
}
