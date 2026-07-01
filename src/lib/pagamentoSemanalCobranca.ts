/**
 * Cobrança semanal com pagamento não realizado — tabela dia a dia.
 *
 * Padrão Lanza (fonte única): skill relatorio-cobrancas + cadastro-recebimento.
 */
import { addDays, daysBetween, parseDataBr, startOfDay } from "./contratoExtrair.js";
import { formatDataBr } from "./pagamentoSemanal.js";

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

/** Usa o 1º vencimento em aberto; `--dia` sobrescreve quando informado. */
export function resolverDiaEscalonamentoSemanal(
  vencimentosBr: string[],
  hojeBr: string,
  diaOverride?: number,
): number | null {
  if (diaOverride != null) return diaOverride;
  const primeiro = vencimentosBr[0];
  if (!primeiro) return null;
  return inferirDiaEscalonamento(primeiro, hojeBr);
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
  const primeiroVenc = input.vencimentosBr[0]!;
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

export function formatResumoCobrancaSemanal(resumo: ResumoCobrancaSemanal): string {
  const venc =
    resumo.vencimentosEmAbertoBr.length === 1
      ? resumo.vencimentosEmAbertoBr[0]!
      : resumo.vencimentosEmAbertoBr.join(", ");
  return [
    `Pagamento semanal (dia ${resumo.diaEscalonamento} — ${resumo.tituloEscalonamento})`,
    `Vencimento em aberto: ${venc}`,
    `Data bloqueio: ${resumo.dataBloqueioBr}`,
    `Total a receber: R$ ${brl(resumo.totalReceber)} (${resumo.diasAtrasados} dias atrasados + ${resumo.diasEmDia} em dia)`,
    `Juros e multa acumulados: R$ ${brl(resumo.jurosMultaAcumulados)}`,
  ].join("\n");
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
    lines.push(formatResumoCobrancaSemanal(resumo));
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
