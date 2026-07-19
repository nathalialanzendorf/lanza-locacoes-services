/**
 * Regras de data para "Pagamento semanal - {DiaSemana} {DD}".
 *
 * - Em aberto (ATRASADO): `dataAutuacao` = vencimento (dia DD do mês, 23:59).
 * - Quitado: `dataAutuacao` = data real do pagamento (não o vencimento).
 */

const DESC_RE =
  /(?:ATRASADO\s*[-–—]?\s*)?(?:\[[^\]]+\]\s*)?Pagamento semanal\s*-\s*(Segunda|Ter[cç]a|Quarta|Quinta|Sexta|S[aá]bado|Domingo)\s+(\d{1,2})\s*$/i;

/** Formato atual — `ATRASADO Multa atraso (N dias) pagamento semanal - Quarta 08`. */
const MULTA_ATRASO_SEMANAL_RE =
  /^(?:ATRASADO\s*[-–—]?\s*)?Multa atraso\s*\((\d+)\s*dias?\)\s*pagamento semanal\s*(?:-\s*(Segunda|Ter[cç]a|Quarta|Quinta|Sexta|S[aá]bado|Domingo)\s+(\d{1,2})|(\d{2}\/\d{2}(?:\/\d{4})?))\s*$/i;

/** Legado — `ATRASADO Juros e multa - Pagamento semanal Quarta 8`. */
const JUROS_DESC_RE =
  /^(?:ATRASADO\s*[-–—]?\s*)?Juros e multa\s*-\s*Pagamento semanal\s+(Segunda|Ter[cç]a|Quarta|Quinta|Sexta|S[aá]bado|Domingo)\s+(\d{1,2})\s*$/i;

import { diaPagamentoParaDow, parseDataBrToDate } from "./caucaoParcelas.js";

const DOW_JS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

const DOW_JS_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export type PagamentoSemanalParsed = {
  diaSemanaLabel: string;
  diaSemanaKey: string;
  diaMes: number;
  dowJs: number;
};

export function isPagamentoSemanalDescricao(descricao: string): boolean {
  return DESC_RE.test(String(descricao ?? "").trim());
}

export function isMultaAtrasoSemanalDescricao(descricao: string): boolean {
  const desc = String(descricao ?? "").trim();
  return MULTA_ATRASO_SEMANAL_RE.test(desc) || JUROS_DESC_RE.test(desc);
}

/** @deprecated Use `isMultaAtrasoSemanalDescricao`. */
export function isJurosMultaSemanalDescricao(descricao: string): boolean {
  return isMultaAtrasoSemanalDescricao(descricao);
}

/** Vencimento DD/MM/AAAA — parcela semanal ou linha de juros vinculada à semana. */
export function vencimentoDespesaSemanalBr(
  descricao: string,
  rastreameDataIso?: string | null,
  dataAutuacao?: string,
): string | null {
  const desc = String(descricao ?? "").trim();
  const multa = desc.match(MULTA_ATRASO_SEMANAL_RE);
  if (multa) {
    if (multa[4]) {
      const dataCurta = multa[4].trim();
      const comAno = /^\d{2}\/\d{2}\/\d{4}$/.test(dataCurta);
      if (comAno) return dataCurta;
      const hint = hintDate(rastreameDataIso);
      return `${dataCurta}/${hint.getFullYear()}`;
    }
    const sintetico = `Pagamento semanal - ${multa[2]} ${multa[3]}`;
    return (
      dataVencimentoSemanalBr(sintetico, rastreameDataIso) ??
      dataVencimentoSemanalBr(sintetico, null)
    );
  }
  const juros = desc.match(JUROS_DESC_RE);
  if (juros) {
    const sintetico = `Pagamento semanal - ${juros[1]} ${juros[2]}`;
    return (
      dataVencimentoSemanalBr(sintetico, rastreameDataIso) ??
      dataVencimentoSemanalBr(sintetico, null)
    );
  }
  const venc = dataVencimentoSemanalBr(desc, rastreameDataIso);
  if (venc) return venc;
  const m = String(dataAutuacao ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
  return m?.[1] ?? null;
}

export function parsePagamentoSemanalDescricao(
  descricao: string,
): PagamentoSemanalParsed | null {
  const m = String(descricao ?? "")
    .trim()
    .match(DESC_RE);
  if (!m) return null;
  const label = m[1]!;
  const key = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const diaMes = Number(m[2]);
  if (!Number.isFinite(diaMes) || diaMes < 1 || diaMes > 31) return null;
  const dowJs = DOW_JS[key];
  if (dowJs === undefined) return null;
  return {
    diaSemanaLabel: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
    diaSemanaKey: key.replace("ç", "c"),
    diaMes,
    dowJs,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDataBr(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Instante ISO → DD/MM/AAAA HH:mm em America/Recife (UTC-3 fixo). */
export function isoToDataHoraBrRecife(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  return `${pad2(br.getUTCDate())}/${pad2(br.getUTCMonth() + 1)}/${br.getUTCFullYear()} ${pad2(br.getUTCHours())}:${pad2(br.getUTCMinutes())}`;
}

export function dataBrComHora(dataBr: string, horaBr: string | null): string {
  if (!horaBr) return dataBr;
  return `${dataBr} ${horaBr}`;
}

/** 23:59 America/Recife → ISO UTC (mesmo padrão de recebimentosSync). */
export function vencimentoBrToIsoEndDay(dataBr: string): string {
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return new Date().toISOString();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T23:59:00-03:00`).toISOString();
}

function hintDate(hintIso?: string | null): Date {
  if (hintIso) {
    const d = new Date(hintIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Vencimento (DD/MM/AAAA) a partir do texto "Pagamento semanal - Quarta 24".
 * Usa o mês/ano do `hintIso` (data do Rastreame) e substitui o dia pelo DD da descrição.
 */
export function dataVencimentoSemanalBr(
  descricao: string,
  hintIso?: string | null,
): string | null {
  const parsed = parsePagamentoSemanalDescricao(descricao);
  if (!parsed) return null;

  const hint = hintDate(hintIso);
  let y = hint.getFullYear();
  let mo = hint.getMonth();
  let candidate = new Date(y, mo, parsed.diaMes, 12, 0, 0);

  if (candidate.getDate() !== parsed.diaMes) {
    mo += 1;
    candidate = new Date(y, mo, parsed.diaMes, 12, 0, 0);
    if (candidate.getDate() !== parsed.diaMes) return null;
  }

  return formatDataBr(candidate);
}

export function montarDescricaoSemanal(
  parsed: PagamentoSemanalParsed,
  diaMes: number,
): string {
  return `Pagamento semanal - ${parsed.diaSemanaLabel} ${pad2(diaMes)}`;
}

/** 1.º dia de pagamento semanal (dia da semana do contrato) na data de início ou depois. */
export function primeiroDiaPagamentoContrato(
  inicioBr: string,
  diaPagamento?: string | null,
): Date {
  const dow = diaPagamentoParaDow(diaPagamento);
  const d = parseDataBrToDate(inicioBr);
  while (d.getDay() !== dow) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Descrição da 1.ª semana paga na retirada (sem parcelamento ou entrada parcial). */
export function montarDescricaoPrimeiraSemanalContrato(
  inicioBr: string,
  diaPagamento?: string | null,
): string {
  const d = primeiroDiaPagamentoContrato(inicioBr, diaPagamento);
  const label = DOW_JS_LABELS[d.getDay()]!;
  const key = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return montarDescricaoSemanal(
    {
      diaSemanaLabel: label,
      diaSemanaKey: key.replace("ç", "c"),
      diaMes: d.getDate(),
      dowJs: d.getDay(),
    },
    d.getDate(),
  );
}

/** Parcelas do saldo da 1.ª semana — sufixo `{n}x{N}` (igual ao de caução). */
export function infoParcelaPrimeiraSemana(
  parcelaAtual: number,
  totalParcelas: number,
  opts?: { atrasado?: boolean },
): string {
  const suffix = `${parcelaAtual}x${totalParcelas}`;
  if (opts?.atrasado === false) {
    return `Pagamento 1ª semana - ${suffix}`;
  }
  return `ATRASADO Pagamento 1ª semana - ${suffix}`;
}

export function montarDescricaoAtrasadoSemanal(
  parsed: PagamentoSemanalParsed,
  diaMes: number,
): string {
  return `ATRASADO Pagamento semanal - ${parsed.diaSemanaLabel} ${diaMes}`;
}

/** Multa de atraso (juros) vinculada à parcela semanal — fonte única do título. */
export function montarDescricaoMultaAtrasoSemanal(
  diasAtraso: number,
  parsed: PagamentoSemanalParsed,
  opts?: { atrasado?: boolean },
): string {
  const prefix = opts?.atrasado !== false ? "ATRASADO " : "";
  const diasLabel = diasAtraso === 1 ? "dia" : "dias";
  return `${prefix}Multa atraso (${diasAtraso} ${diasLabel}) pagamento semanal - ${parsed.diaSemanaLabel} ${pad2(parsed.diaMes)}`;
}

/** Próxima parcela (+7 dias) a partir da descrição e vencimento atual. */
export function proximaParcelaSemanal(
  descricao: string,
  vencimentoBr: string,
): { descricao: string; dataAutuacao: string; rastreameDataIso: string } | null {
  const parsed = parsePagamentoSemanalDescricao(descricao);
  if (!parsed) return null;
  const m = vencimentoBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const base = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  next.setDate(next.getDate() + 7);
  const diaMes = next.getDate();
  const dataAutuacao = formatDataBr(next);
  return {
    descricao: montarDescricaoAtrasadoSemanal(parsed, diaMes),
    dataAutuacao,
    rastreameDataIso: vencimentoBrToIsoEndDay(dataAutuacao),
  };
}

export function stripAtrasadoSemanal(descricao: string): string {
  return String(descricao ?? "")
    .replace(/^ATRASADO\s*[-–—]?\s*/i, "")
    .trim();
}

/** Normaliza baixa integral de pagamento semanal (remove ATRASADO, data = pagamento). */
export function normalizarBaixaSemanal(patch: {
  descricao?: string;
  dataAutuacao?: string;
  paga?: boolean;
  pagaEm?: string | null;
  rastreameDataIso?: string | null;
}): typeof patch {
  if (!patch.descricao || !isPagamentoSemanalDescricao(patch.descricao)) return patch;
  if (patch.paga !== true) return patch;

  const out = { ...patch };
  out.descricao = stripAtrasadoSemanal(out.descricao ?? "");

  if (out.pagaEm) {
    const d = new Date(out.pagaEm);
    if (!Number.isNaN(d.getTime())) {
      out.dataAutuacao = isoToDataHoraBrRecife(out.pagaEm);
      out.rastreameDataIso = d.toISOString();
    }
  } else if (out.dataAutuacao) {
    out.rastreameDataIso =
      out.rastreameDataIso === undefined
        ? vencimentoBrToIsoEndDay(out.dataAutuacao)
        : out.rastreameDataIso;
  }

  return out;
}
