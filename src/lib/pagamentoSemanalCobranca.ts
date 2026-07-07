/**
 * Cobrança semanal com pagamento não realizado — tabela dia a dia.
 *
 * Padrão Lanza (fonte única): skill relatorio-cobrancas + cadastro-recebimento.
 */
import { addDays, daysBetween, parseDataBr, startOfDay } from "./contratoExtrair.js";
import { dataVencimentoSemanalBr, formatDataBr } from "./pagamentoSemanal.js";

export type SituacaoDiaSemanal = "Atrasado" | "Em dia";

export type LinhaCobrancaSemanal = {
  dataBr: string;
  diaSemana: string;
  situacao: SituacaoDiaSemanal;
  /** null quando Em dia (sem juros e multa). */
  jurosMulta: number | null;
  totalDia: number;
};

export type TabelaCobrancaSemanal = {
  vencimentoBr: string;
  periodoInicioBr: string;
  periodoFimBr: string;
  linhas: LinhaCobrancaSemanal[];
  subtotalJurosMulta: number;
  total: number;
};

export type CobrancaSemanalAtrasoInput = {
  valorSemanal: number;
  /** Diária de atraso do contrato (ex.: 120). */
  valorDiaria: number;
  /** Vencimentos em aberto, ordem cronológica (DD/MM/AAAA). */
  vencimentosBr: string[];
  /** Data em que o pagamento integral será/foi recebido. */
  dataPagamentoBr: string;
};

/** Resumo operacional para cobrança WhatsApp (dia 1–4). */
export type ResumoCobrancaSemanal = {
  diaEscalonamento: number;
  tituloEscalonamento: string;
  vencimentosEmAbertoBr: string[];
  dataBloqueioBr: string;
  totalReceber: number;
  diasAtrasados: number;
  diasEmDia: number;
  jurosMultaAcumulados: number;
};

const TITULO_ESCALONAMENTO: Record<number, string> = {
  1: "lembrete",
  2: "aviso",
  3: "bloqueio programado",
  4: "pagamento regularizado",
};

/** Dia previsto do bloqueio = vencimento + 3 dias corridos. */
export const DIAS_ATE_BLOQUEIO = 3;

const DOW_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function diariaNormalSemanal(valorSemanal: number): number {
  return round2(valorSemanal / 7);
}

/** Juros e multa por dia = valorDiaria − (valorSemanal ÷ 7). */
export function jurosMultaDiario(valorSemanal: number, valorDiaria: number): number {
  return round2(valorDiaria - valorSemanal / 7);
}

function parseDataBrOrThrow(s: string): Date {
  const d = parseDataBr(s);
  if (!d) throw new Error(`Data inválida: ${s} (use DD/MM/AAAA).`);
  return startOfDay(d);
}

function diaSemanaLabel(d: Date): string {
  return DOW_PT[d.getDay()] ?? "?";
}

/**
 * Fim do período da parcela:
 * - Com parcela seguinte: véspera do próximo vencimento.
 * - Última parcela em aberto: vencimento + 7 dias (inclusive).
 */
export function periodoFimParcela(vencimento: Date, proximoVencimento: Date | null): Date {
  if (proximoVencimento) {
    return addDays(proximoVencimento, -1);
  }
  return addDays(vencimento, 7);
}

function situacaoDia(
  dia: Date,
  vencimento: Date,
  dataPagamento: Date,
): SituacaoDiaSemanal {
  const d = startOfDay(dia).getTime();
  const v = startOfDay(vencimento).getTime();
  const p = startOfDay(dataPagamento).getTime();
  if (d >= v && d <= p) return "Atrasado";
  return "Em dia";
}

export function calcularTabelaCobrancaSemanal(
  vencimentoBr: string,
  proximoVencimentoBr: string | null,
  input: Pick<CobrancaSemanalAtrasoInput, "valorSemanal" | "valorDiaria" | "dataPagamentoBr">,
): TabelaCobrancaSemanal {
  const vencimento = parseDataBrOrThrow(vencimentoBr);
  const dataPagamento = parseDataBrOrThrow(input.dataPagamentoBr);
  const proximo = proximoVencimentoBr ? parseDataBrOrThrow(proximoVencimentoBr) : null;
  const fim = periodoFimParcela(vencimento, proximo);

  const diariaNormal = diariaNormalSemanal(input.valorSemanal);
  const juros = jurosMultaDiario(input.valorSemanal, input.valorDiaria);

  const linhas: LinhaCobrancaSemanal[] = [];
  let subtotalJurosMulta = 0;
  let total = 0;

  for (let d = new Date(vencimento); d <= fim; d = addDays(d, 1)) {
    const situacao = situacaoDia(d, vencimento, dataPagamento);
    const jm = situacao === "Atrasado" ? juros : null;
    const totalDia = situacao === "Atrasado" ? input.valorDiaria : diariaNormal;
    if (jm != null) subtotalJurosMulta += jm;
    total += totalDia;
    linhas.push({
      dataBr: formatDataBr(d),
      diaSemana: diaSemanaLabel(d),
      situacao,
      jurosMulta: jm,
      totalDia: round2(totalDia),
    });
  }

  return {
    vencimentoBr,
    periodoInicioBr: formatDataBr(vencimento),
    periodoFimBr: formatDataBr(fim),
    linhas,
    subtotalJurosMulta: round2(subtotalJurosMulta),
    total: round2(total),
  };
}

export function calcularCobrancaSemanalAtraso(
  input: CobrancaSemanalAtrasoInput,
): { tabelas: TabelaCobrancaSemanal[]; totalGeral: number } {
  if (input.vencimentosBr.length === 0) {
    throw new Error("Informe ao menos um vencimento em aberto (vencimentosBr).");
  }

  const tabelas: TabelaCobrancaSemanal[] = [];
  for (let i = 0; i < input.vencimentosBr.length; i++) {
    const proximo = i + 1 < input.vencimentosBr.length ? input.vencimentosBr[i + 1]! : null;
    tabelas.push(
      calcularTabelaCobrancaSemanal(input.vencimentosBr[i]!, proximo, input),
    );
  }

  const totalGeral = round2(tabelas.reduce((s, t) => s + t.total, 0));
  return { tabelas, totalGeral };
}

function tituloEscalonamento(dia: number): string {
  return TITULO_ESCALONAMENTO[dia] ?? `dia ${dia}`;
}

/**
 * Escalonamento WhatsApp a partir do vencimento:
 * - no vencimento (D0): ainda no prazo → null (sem mensagem)
 * - D+1 → lembrete (dia 1) · D+2 → aviso (dia 2) · D+3+ → bloqueio (dia 3)
 */
export function inferirDiaEscalonamento(
  vencimentoBr: string,
  hojeBr: string,
): number | null {
  const vencimento = parseDataBrOrThrow(vencimentoBr);
  const hoje = parseDataBrOrThrow(hojeBr);
  const diasAposVencimento = daysBetween(vencimento, hoje);
  if (diasAposVencimento <= 0) return null;
  if (diasAposVencimento >= DIAS_ATE_BLOQUEIO) return 3;
  return diasAposVencimento;
}

/** Vencimento já passou (D+1+) — entra em tabela e cobrança semanal. */
export function vencimentoSemanalElegivelCobranca(
  vencimentoBr: string,
  hojeBr: string,
): boolean {
  return inferirDiaEscalonamento(vencimentoBr, hojeBr) != null;
}

/** Dias corridos desde o vencimento (negativo = futuro). */
function diasDesdeVencimento(vencimentoBr: string, hojeBr: string): number {
  const vencimento = parseDataBrOrThrow(vencimentoBr);
  const hoje = parseDataBrOrThrow(hojeBr);
  return Math.round(
    (startOfDay(hoje).getTime() - startOfDay(vencimento).getTime()) / 86_400_000,
  );
}

/** Vencimento hoje (D0) ou em atraso — entra na listagem do relatório; futuro fica de fora. */
export function vencimentoSemanalElegivelListagemRelatorio(
  vencimentoBr: string,
  hojeBr: string,
): boolean {
  return diasDesdeVencimento(vencimentoBr, hojeBr) >= 0;
}

export function filtrarVencimentosSemanalCobranca(
  vencimentosBr: string[],
  hojeBr: string,
): string[] {
  return vencimentosBr.filter((v) => vencimentoSemanalElegivelCobranca(v, hojeBr));
}

/** Parcela semanal futura — omitir da listagem do relatório; D0 e atrasadas entram. */
export function despesaSemanalElegivelRelatorio(
  d: {
    categoria?: string;
    descricao?: string;
    dataAutuacao?: string;
    rastreameDataIso?: string | null;
  },
  hojeBr: string,
): boolean {
  if (d.categoria !== "Locação semanal") return true;
  const venc =
    dataVencimentoSemanalBr(d.descricao ?? "", d.rastreameDataIso) ??
    d.dataAutuacao ??
    "";
  if (!venc) return true;
  return vencimentoSemanalElegivelListagemRelatorio(venc, hojeBr);
}

/** Primeiro vencimento já vencido (D+1+); `--dia` sobrescreve quando informado. */
export function resolverDiaEscalonamentoSemanal(
  vencimentosBr: string[],
  hojeBr: string,
  diaOverride?: number,
): number | null {
  if (diaOverride != null) return diaOverride;
  for (const venc of vencimentosBr) {
    const dia = inferirDiaEscalonamento(venc, hojeBr);
    if (dia != null) return dia;
  }
  return null;
}

/** Vencimento de referência para resumo (1º em atraso, ou 1º da lista). */
export function vencimentoReferenciaSemanal(
  vencimentosBr: string[],
  hojeBr: string,
): string | null {
  for (const venc of vencimentosBr) {
    if (inferirDiaEscalonamento(venc, hojeBr) != null) return venc;
  }
  return vencimentosBr[0] ?? null;
}

/**
 * Total a cobrar na mensagem: soma dos dias até hoje (`dataPagamentoBr`).
 * Data bloqueio fixa: vencimento + 3 dias.
 */
export function calcularResumoCobrancaSemanal(
  input: CobrancaSemanalAtrasoInput,
  resultado: { tabelas: TabelaCobrancaSemanal[] },
  diaEscalonamento: number,
): ResumoCobrancaSemanal {
  const primeiroVenc =
    vencimentoReferenciaSemanal(input.vencimentosBr, input.dataPagamentoBr) ??
    input.vencimentosBr[0]!;
  const vencimento = parseDataBrOrThrow(primeiroVenc);
  const dataBloqueioBr = formatDataBr(addDays(vencimento, DIAS_ATE_BLOQUEIO));
  const dataCorte = parseDataBrOrThrow(input.dataPagamentoBr);

  let totalReceber = 0;
  let jurosMultaAcumulados = 0;
  let diasAtrasados = 0;
  let diasEmDia = 0;

  for (const tabela of resultado.tabelas) {
    for (const linha of tabela.linhas) {
      const d = parseDataBrOrThrow(linha.dataBr);
      if (d.getTime() > dataCorte.getTime()) continue;
      totalReceber += linha.totalDia;
      if (linha.situacao === "Atrasado") {
        diasAtrasados++;
        if (linha.jurosMulta != null) jurosMultaAcumulados += linha.jurosMulta;
      } else {
        diasEmDia++;
      }
    }
  }

  return {
    diaEscalonamento,
    tituloEscalonamento: tituloEscalonamento(diaEscalonamento),
    vencimentosEmAbertoBr: [...input.vencimentosBr],
    dataBloqueioBr,
    totalReceber: round2(totalReceber),
    diasAtrasados,
    diasEmDia,
    jurosMultaAcumulados: round2(jurosMultaAcumulados),
  };
}

export type JurosPorSemana = {
  vencimentoBr: string;
  jurosMulta: number;
  dias: number;
  /** Total da tabela semanal (período completo da parcela). */
  totalDevido: number;
};

/** Juros e multa por semana até a data de pagamento (corte). */
export function calcularJurosPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
): JurosPorSemana[] {
  const dataCorte = parseDataBrOrThrow(dataPagamentoBr);
  const out: JurosPorSemana[] = [];

  for (const tabela of tabelas) {
    let jurosMulta = 0;
    let dias = 0;
    for (const linha of tabela.linhas) {
      const d = parseDataBrOrThrow(linha.dataBr);
      if (d.getTime() > dataCorte.getTime()) continue;
      if (linha.situacao === "Atrasado" && linha.jurosMulta != null) {
        jurosMulta += linha.jurosMulta;
        dias++;
      }
    }
    if (dias > 0) {
      out.push({
        vencimentoBr: tabela.vencimentoBr,
        jurosMulta: round2(jurosMulta),
        dias,
        totalDevido: tabela.total,
      });
    }
  }

  return out;
}

export function formatResumoPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
): string {
  const porSemana = calcularJurosPorSemana(tabelas, dataPagamentoBr);
  if (porSemana.length === 0) return "";

  const blocos = porSemana.map((s, i) =>
    [
      `Vencimento em aberto: ${s.vencimentoBr}`,
      `Juros e multa: R$ ${brl(s.jurosMulta)} (${s.dias} ${s.dias === 1 ? "diária" : "diárias"})`,
      i === 0
        ? `Total semana: R$ ${brl(s.totalDevido)}`
        : `Valor semana: R$ ${brl(s.totalDevido)}`,
    ].join("\n"),
  );

  return blocos.join("\n\n");
}

/** @deprecated Use formatResumoPorSemana */
export function formatResumoJurosPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
): string {
  return formatResumoPorSemana(tabelas, dataPagamentoBr);
}

export type FormatResumoCobrancaSemanalOpts = {
  tabelas?: TabelaCobrancaSemanal[];
  dataPagamentoBr?: string;
  /** Soma dos totais semanais (período completo de cada parcela). */
  totalGeral?: number;
  /** @deprecated Use totalGeral */
  totalDevido?: number;
};

export function formatResumoCobrancaSemanal(
  resumo: ResumoCobrancaSemanal,
  opts?: FormatResumoCobrancaSemanalOpts,
): string {
  const dataBase = opts?.dataPagamentoBr ?? "";
  const partes = [`Data bloqueio: ${resumo.dataBloqueioBr}`];

  if (dataBase) partes.push(`Base de cálculo: ${dataBase}`);

  if (opts?.tabelas?.length && dataBase) {
    const jurosSemanas = calcularJurosPorSemana(opts.tabelas, dataBase);
    const porSemana = formatResumoPorSemana(opts.tabelas, dataBase);
    if (porSemana) {
      partes.push("", porSemana);
    }
    const totalGeral =
      opts.totalGeral ??
      opts.totalDevido ??
      round2(opts.tabelas.reduce((s, t) => s + t.total, 0));
    const diasAtraso = jurosSemanas.reduce((s, x) => s + x.dias, 0);
    partes.push(
      "",
      `Total a devido : R$ ${brl(totalGeral)} (${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"} em atraso)`,
    );
  } else {
    partes.push(
      "",
      `Total a devido : R$ ${brl(opts?.totalGeral ?? opts?.totalDevido ?? resumo.totalReceber)} (${resumo.diasAtrasados} ${resumo.diasAtrasados === 1 ? "dia" : "dias"} em atraso)`,
    );
    if (resumo.jurosMultaAcumulados > 0) {
      partes.push(`Juros e multa acumulados: R$ ${brl(resumo.jurosMultaAcumulados)}`);
    }
  }

  return partes.join("\n").trimEnd();
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatTabelaCobrancaSemanalMarkdown(
  tabela: TabelaCobrancaSemanal,
  indice?: number,
): string {
  const titulo =
    indice != null
      ? `## Tabela ${indice} — Semana venc. ${tabela.vencimentoBr} (${tabela.periodoInicioBr} a ${tabela.periodoFimBr})`
      : `## Semana venc. ${tabela.vencimentoBr} (${tabela.periodoInicioBr} a ${tabela.periodoFimBr})`;

  const rows = tabela.linhas.map(
    (l) =>
      `| ${l.dataBr} | ${l.diaSemana} | ${l.situacao} | ${l.jurosMulta != null ? brl(l.jurosMulta) : "—"} | ${brl(l.totalDia)} |`,
  );

  const diasJuros = tabela.linhas.filter((l) => l.jurosMulta != null).length;

  return [
    titulo,
    "",
    "| Data | Dia | Situação | Juros e multa | Total/dia |",
    "|---|---|---|---:|---:|",
    ...rows,
    "",
    "| | Dias | Subtotal |",
    "|---|---|---:|",
    `| **Juros e multa** | ${diasJuros} | **R$ ${brl(tabela.subtotalJurosMulta)}** |`,
    `| **Total** | | **R$ ${brl(tabela.total)}** |`,
  ].join("\n");
}

export function formatCobrancaSemanalAtrasoMarkdown(
  input: CobrancaSemanalAtrasoInput & {
    clienteNome?: string;
    placa?: string;
  },
  resultado: ReturnType<typeof calcularCobrancaSemanalAtraso>,
  resumo?: ResumoCobrancaSemanal,
): string {
  const juros = jurosMultaDiario(input.valorSemanal, input.valorDiaria);
  const lines: string[] = [];

  if (input.clienteNome || input.placa) {
    lines.push(`**${input.clienteNome ?? "Cliente"}**${input.placa ? ` — ${input.placa}` : ""}`);
    lines.push("");
  }

  if (resumo) {
    lines.push(
      formatResumoCobrancaSemanal(resumo, {
        tabelas: resultado.tabelas,
        dataPagamentoBr: input.dataPagamentoBr,
        totalGeral: resultado.totalGeral,
      }),
    );
    lines.push("");
  }

  lines.push(`Pagamento em **${input.dataPagamentoBr}** · Semanal R$ ${brl(input.valorSemanal)} · Juros e multa/dia R$ ${brl(juros)} (${brl(input.valorDiaria)} − ${brl(input.valorSemanal)}/7)`);
  lines.push("");

  resultado.tabelas.forEach((t, i) => {
    lines.push(formatTabelaCobrancaSemanalMarkdown(t, i + 1));
    lines.push("");
  });

  lines.push("| | Valor |");
  lines.push("|---|---:|");
  resultado.tabelas.forEach((t, i) => {
    lines.push(`| Tabela ${i + 1} (venc. ${t.vencimentoBr}) | R$ ${brl(t.total)} |`);
  });
  lines.push(`| **Total geral** | **R$ ${brl(resultado.totalGeral)}** |`);

  return lines.join("\n");
}
