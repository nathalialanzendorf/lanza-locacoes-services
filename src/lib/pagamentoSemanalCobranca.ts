/**
 * Cobrança semanal com pagamento não realizado — tabela dia a dia.
 *
 * Padrão Lanza (fonte única): skill relatorio-cobrancas + cadastro-recebimento.
 */
import {
  addDays,
  compararDataBrAsc,
  daysBetween,
  parseDataBr,
  startOfDay,
} from "./contratoExtrair.js";
import {
  dataVencimentoSemanalBr,
  formatDataBr,
  isJurosMultaSemanalDescricao,
  vencimentoDespesaSemanalBr,
} from "./pagamentoSemanal.js";
import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { compactPlaca } from "./placa.js";
import { compactPlacaVeiculoRef } from "./veiculosDb.js";

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
  /** Sobrescreve `dataPagamentoBr` por vencimento (ex.: semanal já quitada). */
  resolverDataPagamentoPorVencimento?: (vencimentoBr: string) => string;
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

/** Bloqueio no 3º dia contando o vencimento (vencimento = dia 1 → bloqueio em vencimento + 2). */
export const DIAS_ATE_BLOQUEIO = 3;

/** Juros/multa: no máximo 7 dias corridos por parcela (vencimento inclusive → +6). */
export const DIAS_JUROS_MULTA_SEMANA = 6;

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
 * Fim do período com juros/multa na parcela: 7 dias corridos (vencimento inclusive).
 */
export function fimJurosMultaParcela(vencimento: Date): Date {
  return addDays(vencimento, DIAS_JUROS_MULTA_SEMANA);
}

/**
 * Fim do período da parcela na tabela:
 * - Com parcela seguinte próxima (≤7 dias): véspera do próximo vencimento.
 * - Com lacuna até a próxima: só os 7 dias da semana (vencimento +6).
 * - Última parcela em aberto: vencimento + 7 dias (dias «Em dia» após o pagamento).
 */
export function periodoFimParcela(vencimento: Date, proximoVencimento: Date | null): Date {
  const fimSemana = fimJurosMultaParcela(vencimento);
  if (proximoVencimento) {
    const vespera = addDays(proximoVencimento, -1);
    return vespera.getTime() < fimSemana.getTime() ? vespera : fimSemana;
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
  const fimJuros = startOfDay(fimJurosMultaParcela(vencimento)).getTime();
  if (d >= v && d <= p && d <= fimJuros) return "Atrasado";
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
    const venc = input.vencimentosBr[i]!;
    const proximo = i + 1 < input.vencimentosBr.length ? input.vencimentosBr[i + 1]! : null;
    const dataPag =
      input.resolverDataPagamentoPorVencimento?.(venc) ?? input.dataPagamentoBr;
    tabelas.push(
      calcularTabelaCobrancaSemanal(venc, proximo, {
        valorSemanal: input.valorSemanal,
        valorDiaria: input.valorDiaria,
        dataPagamentoBr: dataPag,
      }),
    );
  }

  const totalGeral = calcularTotalDevidoCobrancaSemanal(
    input.valorSemanal,
    tabelas,
    input.dataPagamentoBr,
    input.resolverDataPagamentoPorVencimento,
  );
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
  if (diasAposVencimento >= DIAS_ATE_BLOQUEIO - 1) return 3;
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

/**
 * Acordo operacional: só vencimentos **após** `dataInicioJurosMultaBr` entram em
 * juros/multa e na base de bloqueio. Anteriores permanecem como débito nominal.
 */
export function filtrarVencimentosAposDataInicioJuros(
  vencimentosBr: string[],
  dataInicioJurosMultaBr: string | null | undefined,
): string[] {
  const corteBr = dataInicioJurosMultaBr?.trim();
  if (!corteBr) return vencimentosBr;
  const corte = parseDataBrOrThrow(corteBr);
  return vencimentosBr.filter((v) => parseDataBrOrThrow(v).getTime() > corte.getTime());
}

/**
 * Exibir tabela de juros/multa:
 * - em aberto: sempre (inclui D0);
 * - ao quitar: ocultar só se pagar exatamente no vencimento.
 */
export function deveExibirCalculoSemanalAtraso(
  dataReferenciaBr: string,
  vencimentosBr: string[],
  emAberto: boolean,
): boolean {
  if (vencimentosBr.length === 0) return false;
  if (emAberto) return true;
  return vencimentosBr.some((v) => dataReferenciaBr !== v);
}

/** Vencimentos incluídos na tabela conforme regra de exibição. */
export function filtrarVencimentosCalculoSemanal(
  vencimentosBr: string[],
  dataReferenciaBr: string,
  emAberto: boolean,
): string[] {
  if (!deveExibirCalculoSemanalAtraso(dataReferenciaBr, vencimentosBr, emAberto)) {
    return [];
  }
  return vencimentosBr
    .filter((v) => {
      if (emAberto) {
        return vencimentoSemanalElegivelListagemRelatorio(v, dataReferenciaBr);
      }
      return dataReferenciaBr !== v;
    })
    .sort(compararDataBrAsc);
}

function dataBrDePagaEm(pagaEm: string | null | undefined): string | null {
  if (!pagaEm) return null;
  const d = new Date(pagaEm);
  if (Number.isNaN(d.getTime())) return null;
  const br = new Date(d.getTime() - 3 * 3600 * 1000);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(br.getUTCDate())}/${pad2(br.getUTCMonth() + 1)}/${br.getUTCFullYear()}`;
}

/** Data real do pagamento de uma parcela semanal quitada. */
export function dataPagamentoDespesaSemanalBr(d: {
  dataAutuacao?: string;
  pagaEm?: string | null;
}): string | null {
  return (
    dataBrDePagaEm(d.pagaEm) ??
    String(d.dataAutuacao ?? "")
      .trim()
      .match(/^(\d{2}\/\d{2}\/\d{4})/)?.[1] ??
    null
  );
}

/**
 * Data-base para juros/multa de um vencimento:
 * - parcela nominal já quitada → data do pagamento (juros não continuam após a baixa);
 * - em aberto → data de referência (hoje ou projeção da baixa).
 */
export function dataPagamentoEfetivoSemanal(
  vencimentoBr: string,
  dataReferenciaBr: string,
  despesas: ClienteDespesaRegistro[],
  placa: string,
  clienteId: string | null,
): string {
  const placaKey = compactPlaca(placa);
  for (const d of despesas) {
    if (d.categoria !== "Locação semanal") continue;
    if (d.paga !== true) continue;
    if (isJurosMultaSemanalDescricao(d.descricao ?? "")) continue;
    if (/\[NEGOCIADO/i.test(d.descricao ?? "")) continue;
    if (compactPlacaVeiculoRef(d.veiculoId) !== placaKey) continue;
    if (clienteId && d.condutorId !== clienteId) continue;
    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );
    if (venc !== vencimentoBr) continue;
    const pag = dataPagamentoDespesaSemanalBr(d);
    if (pag) return pag;
  }
  return dataReferenciaBr;
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
    vencimentoDespesaSemanalBr(d.descricao ?? "", d.rastreameDataIso, d.dataAutuacao) ??
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
 * Data do bloqueio: 3º dia contando o vencimento (vencimento + 2 dias corridos).
 */
export function calcularDataBloqueioBr(vencimentoBr: string): string {
  const vencimento = parseDataBrOrThrow(vencimentoBr);
  return formatDataBr(addDays(vencimento, DIAS_ATE_BLOQUEIO - 1));
}

/**
 * Total a devido: soma (valor semanal nominal + juros/multa) por parcela em aberto.
 */
export function calcularTotalDevidoCobrancaSemanal(
  valorSemanal: number,
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
  resolverDataPagamentoPorVencimento?: (vencimentoBr: string) => string,
): number {
  const porSemana = calcularJurosPorSemana(
    tabelas,
    dataPagamentoBr,
    valorSemanal,
    resolverDataPagamentoPorVencimento,
  );
  const jurosPorVenc = new Map(porSemana.map((j) => [j.vencimentoBr, j.jurosMulta]));
  let total = 0;
  for (const t of tabelas) {
    total += valorSemanal + (jurosPorVenc.get(t.vencimentoBr) ?? 0);
  }
  return round2(total);
}

/**
 * Total a cobrar na mensagem: valor semanal + juros por parcela.
 * Data bloqueio: 3º dia a partir do vencimento (referência = última parcela em aberto).
 */
export function calcularResumoCobrancaSemanal(
  input: CobrancaSemanalAtrasoInput,
  resultado: { tabelas: TabelaCobrancaSemanal[] },
  diaEscalonamento: number,
): ResumoCobrancaSemanal {
  const vencBloqueio =
    input.vencimentosBr[input.vencimentosBr.length - 1] ??
    vencimentoReferenciaSemanal(input.vencimentosBr, input.dataPagamentoBr) ??
    input.vencimentosBr[0]!;
  const dataBloqueioBr = calcularDataBloqueioBr(vencBloqueio);
  const dataCorte = parseDataBrOrThrow(input.dataPagamentoBr);

  let jurosMultaAcumulados = 0;
  let diasAtrasados = 0;
  let diasEmDia = 0;

  for (const tabela of resultado.tabelas) {
    for (const linha of tabela.linhas) {
      const d = parseDataBrOrThrow(linha.dataBr);
      if (d.getTime() > dataCorte.getTime()) continue;
      if (linha.situacao === "Atrasado") {
        diasAtrasados++;
        if (linha.jurosMulta != null) jurosMultaAcumulados += linha.jurosMulta;
      } else {
        diasEmDia++;
      }
    }
  }

  const totalReceber = calcularTotalDevidoCobrancaSemanal(
    input.valorSemanal,
    resultado.tabelas,
    input.dataPagamentoBr,
    input.resolverDataPagamentoPorVencimento,
  );

  return {
    diaEscalonamento,
    tituloEscalonamento: tituloEscalonamento(diaEscalonamento),
    vencimentosEmAbertoBr: [...input.vencimentosBr],
    dataBloqueioBr,
    totalReceber,
    diasAtrasados,
    diasEmDia,
    jurosMultaAcumulados: round2(jurosMultaAcumulados),
  };
}

export type JurosPorSemana = {
  vencimentoBr: string;
  jurosMulta: number;
  dias: number;
  /** Valor semanal nominal do contrato (não o total da tabela diária). */
  valorSemanal: number;
};

/** Juros e multa por semana até a data de pagamento (corte). */
export function calcularJurosPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
  valorSemanal: number,
  resolverDataPagamentoPorVencimento?: (vencimentoBr: string) => string,
): JurosPorSemana[] {
  const out: JurosPorSemana[] = [];

  for (const tabela of tabelas) {
    const dataCorte = parseDataBrOrThrow(
      resolverDataPagamentoPorVencimento?.(tabela.vencimentoBr) ?? dataPagamentoBr,
    );
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
        valorSemanal,
      });
    }
  }

  return out;
}

export function formatResumoPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
  valorSemanal: number,
  resolverDataPagamentoPorVencimento?: (vencimentoBr: string) => string,
): string {
  const porSemana = calcularJurosPorSemana(
    tabelas,
    dataPagamentoBr,
    valorSemanal,
    resolverDataPagamentoPorVencimento,
  );
  if (porSemana.length === 0) return "";

  const blocos = porSemana.map((s, i) =>
    [
      `Vencimento em aberto: ${s.vencimentoBr}`,
      `Juros e multa: R$ ${brl(s.jurosMulta)} (${s.dias} ${s.dias === 1 ? "diária" : "diárias"})`,
      i === 0
        ? `Total semana: R$ ${brl(s.valorSemanal)}`
        : `Valor semana: R$ ${brl(s.valorSemanal)}`,
    ].join("\n"),
  );

  return blocos.join("\n\n");
}

/** @deprecated Use formatResumoPorSemana */
export function formatResumoJurosPorSemana(
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
  valorSemanal: number,
): string {
  return formatResumoPorSemana(tabelas, dataPagamentoBr, valorSemanal);
}

export type FormatResumoCobrancaSemanalOpts = {
  tabelas?: TabelaCobrancaSemanal[];
  dataPagamentoBr?: string;
  valorSemanal?: number;
  resolverDataPagamentoPorVencimento?: (vencimentoBr: string) => string;
  /** Soma valor semanal + juros por parcela. */
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

  if (opts?.tabelas?.length && dataBase && opts.valorSemanal != null) {
    const jurosSemanas = calcularJurosPorSemana(
      opts.tabelas,
      dataBase,
      opts.valorSemanal,
      opts.resolverDataPagamentoPorVencimento,
    );
    const porSemana = formatResumoPorSemana(
      opts.tabelas,
      dataBase,
      opts.valorSemanal,
      opts.resolverDataPagamentoPorVencimento,
    );
    if (porSemana) {
      partes.push("", porSemana);
    }
    const totalGeral =
      opts.totalGeral ??
      opts.totalDevido ??
      calcularTotalDevidoCobrancaSemanal(
        opts.valorSemanal,
        opts.tabelas,
        dataBase,
        opts.resolverDataPagamentoPorVencimento,
      );
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
        valorSemanal: input.valorSemanal,
        resolverDataPagamentoPorVencimento: input.resolverDataPagamentoPorVencimento,
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

export type PacoteCobrancaSemanalAtraso = {
  markdown: string;
  payload: Record<string, unknown>;
  totalGeral: number;
  resumo?: ResumoCobrancaSemanal;
};

/** Monta markdown + payload da tabela semanal (baixa, cobrança, relatório). */
export function montarPacoteCobrancaSemanalAtraso(opts: {
  valorSemanal: number;
  valorDiaria: number;
  vencimentosBr: string[];
  dataPagamentoBr: string;
  emAberto: boolean;
  diaEscalonamento?: number;
  clienteNome?: string;
  placa?: string;
  clienteId?: string | null;
  dataInicioJurosMultaBr?: string | null;
  despesasSemanal?: ClienteDespesaRegistro[];
}): PacoteCobrancaSemanalAtraso | null {
  const vencimentos = filtrarVencimentosAposDataInicioJuros(
    filtrarVencimentosCalculoSemanal(
      opts.vencimentosBr,
      opts.dataPagamentoBr,
      opts.emAberto,
    ),
    opts.dataInicioJurosMultaBr,
  );
  if (vencimentos.length === 0) return null;

  const resolverDataPagamentoPorVencimento =
    opts.despesasSemanal && opts.placa
      ? (vencimentoBr: string) =>
          dataPagamentoEfetivoSemanal(
            vencimentoBr,
            opts.dataPagamentoBr,
            opts.despesasSemanal!,
            opts.placa!,
            opts.clienteId ?? null,
          )
      : undefined;

  const input: CobrancaSemanalAtrasoInput = {
    valorSemanal: opts.valorSemanal,
    valorDiaria: opts.valorDiaria,
    vencimentosBr: vencimentos,
    dataPagamentoBr: opts.dataPagamentoBr,
    resolverDataPagamentoPorVencimento,
  };
  const resultado = calcularCobrancaSemanalAtraso(input);
  const resumo =
    opts.diaEscalonamento != null
      ? calcularResumoCobrancaSemanal(input, resultado, opts.diaEscalonamento)
      : undefined;

  const payload: Record<string, unknown> = {
    ...input,
    tipo: "pagamento-semanal",
    cliente: opts.clienteId != null || opts.clienteNome
      ? { id: opts.clienteId ?? null, nome: opts.clienteNome ?? null }
      : null,
    placa: opts.placa ?? null,
    dataInicioJurosMultaBr: opts.dataInicioJurosMultaBr ?? null,
    ...resultado,
    diaEscalonamento: opts.diaEscalonamento ?? null,
    resumo: resumo ?? null,
    emAberto: opts.emAberto,
  };

  return {
    markdown: formatCobrancaSemanalAtrasoMarkdown(
      {
        ...input,
        clienteNome: opts.clienteNome,
        placa: opts.placa,
      },
      resultado,
      resumo,
    ),
    payload,
    totalGeral: resultado.totalGeral,
    resumo,
  };
}
