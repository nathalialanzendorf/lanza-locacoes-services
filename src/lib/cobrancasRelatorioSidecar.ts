/**
 * Sidecar JSON do relatório de cobranças.
 * Canvas: mesmo layout visual do encerramento de contrato (sem caução/quebra/créditos).
 */
import fs from "node:fs";
import path from "node:path";

import {
  isCategoriaManutencao,
  isClienteDespesaAtiva,
  despesaAtribuidaACliente,
  isInfracaoTransito,
  isInfracaoSemDataAutuacao,
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { loadClientesDb } from "./clientesDb.js";
import {
  COBRANCAS_OUT_DIR,
  ensureRodapeWhatsApp,
  RODAPE_AUTOMATICO,
  gerarDespesasEmAberto,
  gerarMensagemSemanalAtrasoWhatsApp,
} from "./cobrancas.js";
import type { LoteCobrancaItem, LoteCobrancaResult } from "./cobrancasLote.js";
import {
  infracaoCobravelRelatorio,
  infracaoIncluirListagemDespesasRelatorio,
  infracaoIncluirListagemRelatorio,
  rotuloInfracaoCobranca,
  situacaoInfracaoResumida,
  type RotuloGastoInput,
  type SituacaoInfracaoResumida,
} from "./infracaoTitulo.js";
import { loadInfracoesDb, type InfracaoRegistro } from "./infracoesDb.js";
import { inferirCondutorInfracao, parseDataAutuacao } from "./inferirCondutorInfracao.js";
import type { BlocoInfracoesRelatorio } from "./relatorioInfracoesBlocos.js";
import { montarRelatorioInfracoesBlocos } from "./relatorioInfracoesBlocos.js";
import { buildSemanalAtrasoParaEscopo } from "./cobrancasLote.js";
import {
  listarEscoposContratosAtivosCobranca,
  listarEscoposContratosEncerradosComPendencia,
  despesaNaSituacao,
  despesaNoPeriodo,
  ROTULO_TIPO_COBRANCA,
  type FiltroAlvosCobranca,
  type ModoCanvasCobranca,
  type TipoCobrancaAction,
} from "./cobrancasAlvos.js";
import {
  contratoMaisRecentePar,
  loadContratosDb,
  type ContratoRegistro,
  type MotivoEncerramento,
} from "./contratosDb.js";
import { compararDataBrAsc, daysBetween, parseDataBr } from "./contratoExtrair.js";
import { isCreditoDevolucaoLocatario } from "./encerrarContrato.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { vencimentoClienteDespesaBr } from "./clienteDespesaVencimento.js";
import { formatVeiculoLabel } from "./veiculoLabel.js";
import { vencimentoDespesaSemanalBr } from "./pagamentoSemanal.js";
import {
  despesaSemanalElegivelRelatorio,
  formatResumoCobrancaSemanal,
  type FormatResumoCobrancaSemanalOpts,
  vencimentoSemanalElegivelListagemRelatorio,
  type ResumoCobrancaSemanal,
  type TabelaCobrancaSemanal,
} from "./pagamentoSemanalCobranca.js";
import { rastreavelLabel, tipoRastreame } from "./recebimento/baixaPlano.js";
import { loadVeiculosDb } from "./veiculosDb.js";

export type LinhaDespesaEmAberto = {
  rastreavel: string;
  data: string;
  descricao: string;
  motorista: string;
  tipo: string;
  total: number;
};

export type LinhaRelatorioCobranca = {
  descricao: string;
  placa: string;
  data: string;
  categoria: string;
  valor: number;
};

export type CobrancaRelatorioSidecar = {
  tipo: "cobranca";
  geradoEm: string;
  /** Data de geração do relatório (DD/MM/AAAA). */
  geradoEmBr: string;
  /** Cabeçalho: início → fim (prazo) · Gerado em hoje (dias locados). */
  dataInicio: string;
  dataFim: string;
  qtdDiasContrato: number;
  dataAtual: string;
  qtdDiasLocado: number;
  dataReferencia: string;
  cliente: string;
  placa: string;
  modeloVeiculo: string;
  anoModelo: string;
  /** Presente quando o contrato de referência está encerrado (ex.: "Encerrado em 11/01/2026 — Devolvido"). */
  linhaEncerramento: string | null;
  contrato: {
    inicio: string | null;
    fimPrevisto: string | null;
    prazoDias: number | null;
    valorSemanal: number | null;
    valorDiaria: number | null;
    status: string | null;
    dataEncerramento: string | null;
    motivoEncerramento: string | null;
  };
  infracoes: LinhaRelatorioCobranca[];
  totalInfracoes: number;
  infracoesPagas: LinhaRelatorioCobranca[];
  totalInfracoesPagas: number;
  manutencoes: LinhaRelatorioCobranca[];
  totalManutencoes: number;
  parcelasEmAberto: LinhaRelatorioCobranca[];
  totalParcelasEmAberto: number;
  debitosDiversos: LinhaRelatorioCobranca[];
  totalDebitosDiversos: number;
  pagamentoSemanal: Record<string, unknown> | null;
  resumoSemanal: Record<string, unknown> | null;
  totalDebitos: number;
  despesasEmAberto: LinhaDespesaEmAberto[];
  totalDespesasEmAberto: number;
  mensagensWhatsApp: Array<{ tipo: string; placa: string; titulo: string; texto: string }>;
  avisos: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function slug(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function dataArquivoBr(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function hojeBr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtDataBr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function despesaAberta(d: ClienteDespesaRegistro): boolean {
  if (isInfracaoTransito(d)) return false;
  return (
    isClienteDespesaAtiva(d) &&
    d.paga !== true &&
    (d.situacao === "Em aberto" || !d.paga)
  );
}

/** Todas as infrações do escopo para listagem (qualquer status DETRAN). */
export function coletarInfracoesRelatorio(
  filtro: FiltroAlvosCobranca,
): ClienteDespesaRegistro[] {
  const db = loadClienteDespesasDb();
  const vistos = new Set<string>();
  const out: ClienteDespesaRegistro[] = [];

  for (const d of db.clienteDespesas) {
    if (!infracaoIncluirListagemRelatorio(d)) continue;
    if (isInfracaoSemDataAutuacao(d) && !d.condutorId) continue;
    if (d.id && vistos.has(d.id)) continue;

    if (filtro.placa && compactPlaca(d.veiculoId) !== compactPlaca(filtro.placa)) {
      continue;
    }
    if (filtro.clienteId && !despesaDoCliente(d, filtro.clienteId)) {
      continue;
    }
    if (!despesaNaSituacao(d, filtro.situacao ?? "em_aberto")) {
      continue;
    }
    if (!despesaNoPeriodo(d, filtro)) {
      continue;
    }

    if (d.id) vistos.add(d.id);
    out.push(d);
  }

  return out;
}

function isQuebraContrato(d: ClienteDespesaRegistro): boolean {
  const cat = (d.categoria ?? "").toLowerCase();
  if (cat === "quebra contrato") return true;
  const desc = (d.descricao ?? "").toLowerCase();
  return desc.includes("quebra de contrato") || desc.includes("retenção caução (quebra");
}

function veiculoLabelDespesa(d: ClienteDespesaRegistro): string {
  const p = compactPlaca(d.veiculoId);
  const v = loadVeiculosDb().veiculos.find(
    (x) => x.id === d.veiculoId || compactPlaca(x.placa) === p,
  );
  if (v) return formatVeiculoLabel(v);
  return formatVeiculoLabel({ placa: d.veiculoId });
}

function linhaDespesa(d: ClienteDespesaRegistro): LinhaRelatorioCobranca {
  const descricao = isInfracaoTransito(d)
    ? rotuloInfracaoCobranca(d)
    : d.descricao?.trim() || d.titulo?.trim() || "(sem descrição)";
  return {
    descricao,
    placa: veiculoLabelDespesa(d),
    data: vencimentoClienteDespesaBr(d) ?? "—",
    categoria: d.categoria ?? "Outros",
    valor: round2(Number(d.valorMulta) || 0),
  };
}

function somaLinhas(linhas: LinhaRelatorioCobranca[]): number {
  return round2(linhas.reduce((s, l) => s + l.valor, 0));
}

function veiculoInfo(placa: string): { modelo: string; ano: string } {
  const p = compactPlaca(placa);
  const v = loadVeiculosDb().veiculos.find((x) => compactPlaca(x.placa) === p);
  return {
    modelo: v?.marcaModelo ?? "—",
    ano: v?.anoModelo ?? "—",
  };
}

function ordenarContratosRecentes(a: ContratoRegistro, b: ContratoRegistro): number {
  const byVersao = (b.versao ?? 0) - (a.versao ?? 0);
  if (byVersao !== 0) return byVersao;
  return compararDataBrAsc(b.dataInicio ?? "", a.dataInicio ?? "");
}

function contratoAtivoPar(
  placa: string,
  clienteId?: string | null,
): ContratoRegistro | undefined {
  const p = compactPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) =>
      c.status === "ativo" &&
      compactPlaca(c.placa ?? "") === p &&
      (!clienteId || c.clienteId === clienteId),
  );
  if (list.length === 0) return undefined;
  return list.sort(ordenarContratosRecentes)[0];
}

/** Contrato ativo do par; se não houver, o mais recente (inclui encerrado). */
function contratoReferenciaCobranca(
  placa: string,
  clienteId?: string | null,
): ContratoRegistro | undefined {
  if (!placa || placa === "—") {
    return clienteId ? ultimoContratoPorCliente(clienteId) : undefined;
  }

  const ativo = contratoAtivoPar(placa, clienteId);
  if (ativo) return ativo;

  if (clienteId) {
    return contratoMaisRecentePar({ placa, clienteId });
  }

  const p = compactPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) => compactPlaca(c.placa ?? "") === p,
  );
  if (list.length === 0) return undefined;
  return list.sort(ordenarContratosRecentes)[0];
}

function ultimoContratoPorCliente(clienteId: string): ContratoRegistro | undefined {
  const ativos = loadContratosDb().contratos.filter(
    (c) => c.status === "ativo" && c.clienteId === clienteId,
  );
  if (ativos.length > 0) {
    return ativos.sort(ordenarContratosRecentes)[0];
  }

  const todos = loadContratosDb().contratos.filter((c) => c.clienteId === clienteId);
  if (todos.length === 0) return undefined;
  return todos.sort(ordenarContratosRecentes)[0];
}

function rotuloMotivoEncerramento(motivo?: MotivoEncerramento | null): string {
  switch (motivo) {
    case "devolvido":
      return "Devolvido";
    case "recuperado":
      return "Recuperado";
    case "troca":
      return "Troca de veículo";
    default:
      return motivo ? String(motivo) : "—";
  }
}

function linhaEncerramentoContrato(c: ContratoRegistro | undefined): string | null {
  if (!c || c.status !== "encerrado" || !c.dataEncerramento?.trim()) return null;
  return `Encerrado em ${c.dataEncerramento.trim()} — ${rotuloMotivoEncerramento(c.motivoEncerramento)}`;
}

function contratoInfo(placa: string, clienteId: string | null, dataAtualBr: string) {
  const c = contratoReferenciaCobranca(placa, clienteId);
  const dataInicio = c?.dataInicio ?? null;
  const dataFim = c?.dataFimPrevista ?? null;
  const qtdDiasContrato = c?.prazoDias ?? null;

  let qtdDiasLocado: number | null = null;
  if (dataInicio) {
    const inicio = parseDataBr(dataInicio);
    const fimRef =
      c?.status === "encerrado" && c.dataEncerramento
        ? parseDataBr(c.dataEncerramento)
        : parseDataBr(dataAtualBr);
    if (inicio && fimRef) qtdDiasLocado = daysBetween(inicio, fimRef);
  }

  return {
    inicio: dataInicio,
    fimPrevisto: dataFim,
    prazoDias: qtdDiasContrato,
    valorSemanal: c?.valorSemanal ?? null,
    valorDiaria: c?.valorDiaria ?? null,
    status: c?.status ?? null,
    dataEncerramento: c?.dataEncerramento ?? null,
    motivoEncerramento: c?.motivoEncerramento ?? null,
    linhaEncerramento: linhaEncerramentoContrato(c),
    dataInicio: dataInicio ?? "—",
    dataFim: dataFim ?? "—",
    qtdDiasContrato: qtdDiasContrato ?? 0,
    dataAtual: dataAtualBr,
    qtdDiasLocado: qtdDiasLocado ?? 0,
  };
}

function despesaDoCliente(d: ClienteDespesaRegistro, clienteId: string): boolean {
  return despesaAtribuidaACliente(d, clienteId);
}

function classificarDespesa(
  d: ClienteDespesaRegistro,
): "infracoes" | "manutencoes" | "parcelasEmAberto" | "debitosDiversos" {
  const cat = d.categoria ?? "";
  if (isInfracaoTransito(d)) return "infracoes";
  if (isCategoriaManutencao(cat)) return "manutencoes";
  if (cat === "Locação semanal") return "parcelasEmAberto";
  return "debitosDiversos";
}

/** Todas as despesas em aberto do escopo (cliente ou placa), exceto quebra e créditos. */
export function coletarTodasDespesasAbertas(filtro: FiltroAlvosCobranca): ClienteDespesaRegistro[] {
  const db = loadClienteDespesasDb();
  const vistos = new Set<string>();
  const out: ClienteDespesaRegistro[] = [];

  for (const d of db.clienteDespesas) {
    if (!despesaNaSituacao(d, filtro.situacao ?? "em_aberto")) continue;
    if (isQuebraContrato(d)) continue;
    if (isCreditoDevolucaoLocatario(d)) continue;
    if (d.id && vistos.has(d.id)) continue;

    if (filtro.placa && compactPlaca(d.veiculoId) !== compactPlaca(filtro.placa)) {
      continue;
    }
    if (filtro.clienteId && !despesaDoCliente(d, filtro.clienteId)) {
      continue;
    }
    if (!despesaNoPeriodo(d, filtro)) {
      continue;
    }

    if (d.id) vistos.add(d.id);
    out.push(d);
  }

  return out;
}

function ordenarLinhas(linhas: LinhaRelatorioCobranca[]): LinhaRelatorioCobranca[] {
  return [...linhas].sort(
    (a, b) => compararDataBrAsc(a.data, b.data) || a.placa.localeCompare(b.placa),
  );
}

function resolverMotoristaDespesa(
  d: ClienteDespesaRegistro,
  fallbackMotorista: string,
): string {
  if (d.condutorId) {
    const c = loadClientesDb().clientes.find((x) => x.id === d.condutorId);
    if (c?.nome) return c.nome;
  }
  const contrato = contratoReferenciaCobranca(d.veiculoId);
  if (contrato?.clienteNome) return contrato.clienteNome;
  return fallbackMotorista || "—";
}

function linhaDespesaEmAberto(
  d: ClienteDespesaRegistro,
  fallbackMotorista: string,
): LinhaDespesaEmAberto {
  const descricao = isInfracaoTransito(d)
    ? rotuloInfracaoCobranca(d)
    : d.descricao?.trim() || d.titulo?.trim() || "(sem descrição)";
  return {
    rastreavel: veiculoLabelDespesa(d),
    data: vencimentoClienteDespesaBr(d) ?? (d.dataAutuacao || "—"),
    descricao,
    motorista: resolverMotoristaDespesa(d, fallbackMotorista),
    tipo: tipoRastreame(d.categoria),
    total: round2(Number(d.valorMulta) || 0),
  };
}

function montarDespesasEmAberto(
  despesas: ClienteDespesaRegistro[],
  fallbackMotorista: string,
): LinhaDespesaEmAberto[] {
  return [...despesas]
    .map((d) => linhaDespesaEmAberto(d, fallbackMotorista))
    .sort(
      (a, b) =>
        compararDataBrAsc(a.data, b.data) || a.rastreavel.localeCompare(b.rastreavel),
    );
}

/** Lista de despesas em aberto formatada para WhatsApp (template despesas-em-aberto.txt). */
export function formatDespesasEmAbertoWhatsApp(
  linhas: LinhaDespesaEmAberto[],
  opts: { placa: string; nomeCliente: string },
): string {
  if (linhas.length === 0) return "";
  return gerarDespesasEmAberto(
    opts.placa,
    linhas.map((l) => ({
      rastreavel: l.rastreavel,
      data: l.data,
      descricao: l.descricao,
      total: l.total,
    })),
    { nome: opts.nomeCliente },
  ).texto;
}

/** Remove o rodapé automático antes de concatenar mensagens. */
export function stripRodapeWhatsApp(texto: string): string {
  let corpo = texto.trimEnd();
  const plain = RODAPE_AUTOMATICO.replace(/^_|_$/g, "");
  for (const marcador of [RODAPE_AUTOMATICO, plain]) {
    const idx = corpo.lastIndexOf(marcador);
    if (idx !== -1) {
      corpo = corpo.slice(0, idx).trimEnd();
    }
  }
  return corpo;
}

const ORDEM_TIPO_WHATSAPP = [
  "pagamento-semanal",
  "semanal-atraso",
  "infracoes",
  "renegociacao",
  "pedagio",
  "estacionamento-rotativo",
  "manutencao",
  "despesas-em-aberto",
] as const;

const ROTULO_TIPO_WHATSAPP: Record<string, string> = {
  "pagamento-semanal": "Pagamento semanal",
  "semanal-atraso": "Atraso semanal (juros e multa)",
  infracoes: "Infrações",
  renegociacao: "Renegociação",
  pedagio: "Pedágio Digital",
  "estacionamento-rotativo": "Estacionamento rotativo",
  manutencao: "Manutenção",
  "despesas-em-aberto": "Despesas em aberto",
};

export function rotuloTipoWhatsApp(tipo: string): string {
  return ROTULO_TIPO_WHATSAPP[tipo] ?? tipo;
}

/** Todas as mensagens por tipo — sem ocultar tipos dedicados. */
export function mensagensWhatsAppVisiveis<
  T extends { titulo: string; texto: string; tipo?: string },
>(mensagens: T[]): T[] {
  return mensagens;
}

export function agruparMensagensWhatsAppPorTipo<
  T extends { tipo: string; titulo: string; texto: string },
>(mensagens: T[]): Array<{ tipo: string; rotulo: string; mensagens: T[] }> {
  const porTipo = new Map<string, T[]>();
  for (const m of mensagens) {
    const lista = porTipo.get(m.tipo) ?? [];
    lista.push(m);
    porTipo.set(m.tipo, lista);
  }
  const ordenados = [...porTipo.entries()].sort(([a], [b]) => {
    const ia = ORDEM_TIPO_WHATSAPP.indexOf(a as (typeof ORDEM_TIPO_WHATSAPP)[number]);
    const ib = ORDEM_TIPO_WHATSAPP.indexOf(b as (typeof ORDEM_TIPO_WHATSAPP)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ordenados.map(([tipo, msgs]) => ({
    tipo,
    rotulo: rotuloTipoWhatsApp(tipo),
    mensagens: msgs,
  }));
}

/** Resumo semanal com destaque WhatsApp (totais por semana + total a devido). */
export function formatResumoSemanalWhatsApp(
  resumo: ResumoCobrancaSemanal,
  opts?: FormatResumoCobrancaSemanalOpts,
): string {
  return formatResumoCobrancaSemanal(resumo, opts)
    .split("\n")
    .map((line) => {
      if (
        line.startsWith("Total semana:") ||
        line.startsWith("Valor semana:") ||
        line.startsWith("Total a devido :")
      ) {
        return `*${line}*`;
      }
      return line;
    })
    .join("\n");
}

export type MontarMensagensWhatsAppOpts = {
  mensagens: Array<{ tipo: string; placa: string; titulo: string; texto: string }>;
  despesasEmAberto: LinhaDespesaEmAberto[];
  placa: string;
  nomeCliente: string;
  resumoSemanal?: ResumoCobrancaSemanal | null;
  tabelasSemanal?: TabelaCobrancaSemanal[];
  dataPagamentoBr?: string;
  totalGeralSemanal?: number;
  /** @deprecated Use totalGeralSemanal */
  totalDevidoSemanal?: number;
  valorSemanal?: number;
  /** Tipos pedidos na CLI — quando só `manutencao`, mantém mensagem dedicada (sem despesas em aberto). */
  tiposSolicitados?: TipoCobrancaAction[];
  /** Total cobrável — exclui infrações advertidas/quitadas no DETRAN. */
  totalDespesasEmAberto?: number;
};

/** Mensagens WhatsApp separadas: uma por tipo de cobrança + despesas em aberto (escopo completo). */
export function montarMensagensWhatsAppEscopo(
  opts: MontarMensagensWhatsAppOpts,
): Array<{ tipo: string; placa: string; titulo: string; texto: string }> {
  const out: Array<{ tipo: string; placa: string; titulo: string; texto: string }> = [];

  const tipoUnico = opts.tiposSolicitados?.length === 1;
  const incluirDespesasEmAberto =
    !tipoUnico &&
    opts.despesasEmAberto.length > 0 &&
    (opts.totalDespesasEmAberto ?? 0) > 0;

  for (const m of opts.mensagens) {
    out.push(m);
  }

  if (
    opts.resumoSemanal &&
    opts.tabelasSemanal?.length &&
    opts.dataPagamentoBr &&
    !out.some((m) => m.tipo === "semanal-atraso")
  ) {
    const blocoResumo = formatResumoSemanalWhatsApp(opts.resumoSemanal, {
      tabelas: opts.tabelasSemanal,
      dataPagamentoBr: opts.dataPagamentoBr,
      valorSemanal: opts.valorSemanal,
      totalGeral:
        opts.totalGeralSemanal ??
        opts.totalDevidoSemanal ??
        opts.resumoSemanal.totalReceber,
    });
    const msgAtraso = gerarMensagemSemanalAtrasoWhatsApp(opts.placa, {
      nome: opts.nomeCliente,
      blocoResumo,
    });
    out.push({
      tipo: "semanal-atraso",
      placa: opts.placa,
      titulo: msgAtraso.titulo.replace(/\*/g, "").trim(),
      texto: msgAtraso.texto,
    });
  }

  if (!incluirDespesasEmAberto) {
    return out.map((m) => ({ ...m, texto: ensureRodapeWhatsApp(m.texto) }));
  }

  const despesas = gerarDespesasEmAberto(
    opts.placa,
    opts.despesasEmAberto.map((l) => ({
      rastreavel: l.rastreavel,
      data: l.data,
      descricao: l.descricao,
      total: l.total,
    })),
    { nome: opts.nomeCliente, total: opts.totalDespesasEmAberto },
  );
  if (despesas.texto) {
    out.push({
      tipo: "despesas-em-aberto",
      placa: opts.placa,
      titulo: despesas.titulo.replace(/\*/g, "").trim(),
      texto: despesas.texto,
    });
  }

  return out.map((m) => ({ ...m, texto: ensureRodapeWhatsApp(m.texto) }));
}

function parseResumoSemanal(raw: Record<string, unknown> | null): ResumoCobrancaSemanal | null {
  if (!raw || raw.diaEscalonamento == null) return null;
  return raw as unknown as ResumoCobrancaSemanal;
}

/** Tabela markdown no formato cadastro-recebimento (Rastreável | Data | … | Total). */
export function formatTabelaDespesasEmAberto(linhas: LinhaDespesaEmAberto[]): string {
  if (linhas.length === 0) return "";
  const rows = linhas.map(
    (l) =>
      `| ${l.rastreavel} | ${l.data} | ${l.descricao} | ${l.motorista} | ${l.tipo} | R$ ${l.total.toFixed(2)} |`,
  );
  const total = round2(linhas.reduce((s, l) => s + l.total, 0));
  return [
    "| Rastreável | Data | Descrição | Motorista | Tipo | Total |",
    "|---|---|---|---|---|---|",
    ...rows,
    `| **Total** | | | | | **R$ ${total.toFixed(2)}** |`,
  ].join("\n");
}

function classificarDespesasEmSecoes(
  despesas: ClienteDespesaRegistro[],
  infracoesRelatorio: ClienteDespesaRegistro[],
) {
  const infracoes: LinhaRelatorioCobranca[] = [];
  const infracoesPagas: LinhaRelatorioCobranca[] = [];
  const manutencoes: LinhaRelatorioCobranca[] = [];
  const parcelasEmAberto: LinhaRelatorioCobranca[] = [];
  const debitosDiversos: LinhaRelatorioCobranca[] = [];

  for (const d of infracoesRelatorio) {
    const linha = linhaDespesa(d);
    if (infracaoCobravelRelatorio(d)) {
      infracoes.push(linha);
    } else {
      infracoesPagas.push(linha);
    }
  }

  for (const d of despesas) {
    const linha = linhaDespesa(d);
    switch (classificarDespesa(d)) {
      case "infracoes":
        break;
      case "manutencoes":
        manutencoes.push(linha);
        break;
      case "parcelasEmAberto":
        parcelasEmAberto.push(linha);
        break;
      case "debitosDiversos":
        debitosDiversos.push(linha);
        break;
    }
  }

  return {
    infracoes: ordenarLinhas(infracoes),
    infracoesPagas: ordenarLinhas(infracoesPagas),
    manutencoes: ordenarLinhas(manutencoes),
    parcelasEmAberto: ordenarLinhas(parcelasEmAberto),
    debitosDiversos: ordenarLinhas(debitosDiversos),
  };
}

function resolverPlacaPrincipal(
  filtro: FiltroAlvosCobranca,
  despesas: ClienteDespesaRegistro[],
  itemsLote: LoteCobrancaItem[],
): string {
  if (filtro.placa) return formatPlacaHyphen(filtro.placa);

  // Escopo por cliente: placa do contrato ativo (ou mais recente), não a do único alvo do lote.
  if (filtro.clienteId) {
    const ultimo = ultimoContratoPorCliente(filtro.clienteId);
    if (ultimo?.placa) return formatPlacaHyphen(ultimo.placa);
  }

  const placasLote = [...new Set(itemsLote.map((i) => formatPlacaHyphen(i.alvo.placa)))];
  if (placasLote.length === 1) return placasLote[0]!;
  if (placasLote.length > 1) {
    const comContrato = placasLote.filter((p) => {
      const c = contratoReferenciaCobranca(p, filtro.clienteId);
      return c?.clienteId === filtro.clienteId;
    });
    if (comContrato.length === 1) return comContrato[0]!;
  }

  const contagem = new Map<string, number>();
  for (const d of despesas) {
    const p = compactPlaca(d.veiculoId);
    contagem.set(p, (contagem.get(p) ?? 0) + 1);
  }
  let melhor = despesas[0]?.veiculoId ?? "—";
  let max = 0;
  for (const [p, n] of contagem) {
    if (n > max) {
      max = n;
      melhor = p;
    }
  }
  return formatPlacaHyphen(melhor);
}

function resolverNomeCliente(filtro: FiltroAlvosCobranca, placa: string): string {
  if (filtro.clienteId) {
    const c = loadClientesDb().clientes.find((x) => x.id === filtro.clienteId);
    if (c?.nome) return c.nome;
  }
  const vigente = contratoReferenciaCobranca(placa, filtro.clienteId);
  if (vigente?.clienteNome) return vigente.clienteNome;
  return "(sem cliente)";
}

function vencimentosAtrasadoSemanal(
  despesas: ClienteDespesaRegistro[],
  placa: string,
  clienteId: string | null,
  hojeBr: string,
): string[] {
  const placaKey = compactPlaca(placa);
  const vencimentos: string[] = [];

  for (const d of despesas) {
    if (d.categoria !== "Locação semanal") continue;
    if (!/ATRASADO/i.test(d.descricao ?? "")) continue;
    if (compactPlaca(d.veiculoId) !== placaKey) continue;
    if (clienteId && !despesaDoCliente(d, clienteId)) continue;

    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );
    if (
      venc &&
      !vencimentos.includes(venc) &&
      vencimentoSemanalElegivelListagemRelatorio(venc, hojeBr)
    ) {
      vencimentos.push(venc);
    }
  }

  return vencimentos.sort(compararDataBrAsc);
}

function extrairWhatsAppEAvisos(items: LoteCobrancaItem[]) {
  const mensagensWhatsApp: CobrancaRelatorioSidecar["mensagensWhatsApp"] = [];
  const avisos: string[] = [];
  let pagamentoSemanal: Record<string, unknown> | null = null;
  let resumoSemanal: Record<string, unknown> | null = null;

  for (const item of items) {
    if (item.aviso) avisos.push(item.aviso);
    if (item.semanalAtraso?.payload) {
      pagamentoSemanal = item.semanalAtraso.payload;
      resumoSemanal =
        (item.semanalAtraso.resumo as Record<string, unknown> | undefined) ?? null;
    }
    for (const r of item.resultados) {
      mensagensWhatsApp.push({
        tipo: item.alvo.tipo,
        placa: item.alvo.placa,
        titulo: r.titulo,
        texto: r.texto,
      });
    }
  }

  return { mensagensWhatsApp, avisos, pagamentoSemanal, resumoSemanal };
}

function garantirPagamentoSemanalSidecar(
  pagamentoSemanal: Record<string, unknown> | null,
  resumoSemanal: Record<string, unknown> | null,
  opts: {
    placa: string;
    clienteId: string | null;
    clienteNome: string;
    despesas: ClienteDespesaRegistro[];
    dataReferencia: string;
  },
): {
  pagamentoSemanal: Record<string, unknown> | null;
  resumoSemanal: Record<string, unknown> | null;
} {
  if (pagamentoSemanal) return { pagamentoSemanal, resumoSemanal };

  const vencimentos = vencimentosAtrasadoSemanal(
    opts.despesas,
    opts.placa,
    opts.clienteId,
    opts.dataReferencia,
  );
  if (vencimentos.length === 0) return { pagamentoSemanal: null, resumoSemanal: null };

  const semanal = buildSemanalAtrasoParaEscopo(
    opts.placa,
    opts.clienteId,
    opts.clienteNome,
    vencimentos,
    opts.dataReferencia,
    undefined,
    undefined,
    opts.despesas,
  );
  if (!semanal) return { pagamentoSemanal: null, resumoSemanal: null };

  return {
    pagamentoSemanal: semanal.payload,
    resumoSemanal:
      (semanal.resumo as Record<string, unknown> | undefined) ?? null,
  };
}

export function montarCobrancaSidecar(
  filtro: FiltroAlvosCobranca,
  itemsLote: LoteCobrancaItem[],
  dataReferencia: string,
  tiposSolicitados?: TipoCobrancaAction[],
): CobrancaRelatorioSidecar | null {
  const despesas = coletarTodasDespesasAbertas(filtro).filter((d) =>
    despesaSemanalElegivelRelatorio(d, dataReferencia),
  );
  const infracoesDb = coletarInfracoesRelatorio(filtro);
  const escopoUnico = filtro.clienteId != null || filtro.placa != null;
  if (
    despesas.length === 0 &&
    infracoesDb.length === 0 &&
    itemsLote.length === 0 &&
    !escopoUnico
  ) {
    return null;
  }

  const placa = resolverPlacaPrincipal(filtro, [...despesas, ...infracoesDb], itemsLote);
  const cliente = resolverNomeCliente(filtro, placa);
  const clienteId =
    filtro.clienteId ?? contratoReferenciaCobranca(placa)?.clienteId ?? null;

  const secoes = classificarDespesasEmSecoes(despesas, infracoesDb);
  const totalInfracoes = somaLinhas(secoes.infracoes);
  const totalInfracoesPagas = somaLinhas(secoes.infracoesPagas);
  const totalManutencoes = somaLinhas(secoes.manutencoes);
  const totalParcelasEmAberto = somaLinhas(secoes.parcelasEmAberto);
  const totalDebitosDiversos = somaLinhas(secoes.debitosDiversos);
  const totalDebitos = round2(
    totalInfracoes + totalManutencoes + totalParcelasEmAberto + totalDebitosDiversos,
  );

  let { mensagensWhatsApp, avisos, pagamentoSemanal, resumoSemanal } =
    extrairWhatsAppEAvisos(itemsLote);

  ({ pagamentoSemanal, resumoSemanal } = garantirPagamentoSemanalSidecar(
    pagamentoSemanal,
    resumoSemanal,
    {
      placa,
      clienteId,
      clienteNome: cliente,
      despesas,
      dataReferencia,
    },
  ));

  const despesasEmAberto = montarDespesasEmAberto(
    [
      ...despesas,
      ...infracoesDb.filter((d) => infracaoIncluirListagemDespesasRelatorio(d)),
    ],
    cliente,
  );
  const totalDespesasEmAberto = round2(
    montarDespesasEmAberto(
      [
        ...despesas,
        ...infracoesDb.filter((d) => infracaoCobravelRelatorio(d)),
      ],
      cliente,
    ).reduce((s, l) => s + l.total, 0),
  );

  const tabelasSemanal =
    (pagamentoSemanal?.tabelas as TabelaCobrancaSemanal[] | undefined) ?? [];
  const dataPagamentoBr =
    String(pagamentoSemanal?.dataPagamentoBr ?? dataReferencia);

  const { modelo, ano } = veiculoInfo(placa);
  const dataAtual = hojeBr();
  const vigencia = contratoInfo(placa, clienteId, dataAtual);

  mensagensWhatsApp = montarMensagensWhatsAppEscopo({
    mensagens: mensagensWhatsApp,
    despesasEmAberto,
    placa,
    nomeCliente: cliente,
    resumoSemanal: parseResumoSemanal(resumoSemanal),
    tabelasSemanal,
    dataPagamentoBr,
    valorSemanal:
      typeof pagamentoSemanal?.valorSemanal === "number"
        ? pagamentoSemanal.valorSemanal
        : vigencia.valorSemanal ?? undefined,
    totalGeralSemanal:
      typeof pagamentoSemanal?.totalGeral === "number"
        ? pagamentoSemanal.totalGeral
        : undefined,
    tiposSolicitados,
    totalDespesasEmAberto,
  });

  return {
    tipo: "cobranca",
    geradoEm: new Date().toISOString(),
    geradoEmBr: dataAtual,
    dataInicio: vigencia.dataInicio,
    dataFim: vigencia.dataFim,
    qtdDiasContrato: vigencia.qtdDiasContrato,
    dataAtual: vigencia.dataAtual,
    qtdDiasLocado: vigencia.qtdDiasLocado,
    dataReferencia,
    cliente,
    placa,
    modeloVeiculo: modelo,
    anoModelo: ano,
    contrato: {
      inicio: vigencia.inicio,
      fimPrevisto: vigencia.fimPrevisto,
      prazoDias: vigencia.prazoDias,
      valorSemanal: vigencia.valorSemanal,
      valorDiaria: vigencia.valorDiaria,
      status: vigencia.status,
      dataEncerramento: vigencia.dataEncerramento,
      motivoEncerramento: vigencia.motivoEncerramento,
    },
    linhaEncerramento: vigencia.linhaEncerramento,
    infracoes: secoes.infracoes,
    totalInfracoes,
    infracoesPagas: secoes.infracoesPagas,
    totalInfracoesPagas,
    manutencoes: secoes.manutencoes,
    totalManutencoes,
    parcelasEmAberto: secoes.parcelasEmAberto,
    totalParcelasEmAberto,
    debitosDiversos: secoes.debitosDiversos,
    totalDebitosDiversos,
    pagamentoSemanal,
    resumoSemanal,
    totalDebitos,
    despesasEmAberto,
    totalDespesasEmAberto,
    mensagensWhatsApp,
    avisos: [...new Set(avisos)],
  };
}

function itemsLoteDoEscopo(
  results: LoteCobrancaResult[],
  filtro: FiltroAlvosCobranca,
): LoteCobrancaItem[] {
  const items: LoteCobrancaItem[] = [];
  for (const result of results) {
    for (const item of result.items) {
      if (filtro.placa && compactPlaca(item.alvo.placa) !== compactPlaca(filtro.placa)) {
        continue;
      }
      if (filtro.clienteId && item.alvo.clienteId !== filtro.clienteId) {
        continue;
      }
      items.push(item);
    }
  }
  return items;
}

function nomeClientePorId(clienteId: string): string {
  return loadClientesDb().clientes.find((x) => x.id === clienteId)?.nome ?? clienteId;
}

/**
 * Escopos para sidecar/canvas sem filtro CLI: **um por cliente** (todas as placas/débitos),
 * igual a `--cliente`. Inclui locatários ativos e ex-locatários com pendência no lote.
 * Fallback placa-only só quando o alvo do lote não tem `clienteId`.
 */
export function listarEscoposSidecar(
  results: LoteCobrancaResult[],
  filtro?: FiltroAlvosCobranca,
): FiltroAlvosCobranca[] {
  const clienteIds = new Set<string>();
  const placasSemCliente = new Set<string>();

  for (const escopo of listarEscoposContratosAtivosCobranca()) {
    if (escopo.clienteId) clienteIds.add(escopo.clienteId);
  }

  for (const escopo of listarEscoposContratosEncerradosComPendencia(undefined, filtro)) {
    if (escopo.clienteId) clienteIds.add(escopo.clienteId);
  }

  for (const result of results) {
    for (const item of result.items) {
      if (item.alvo.clienteId) {
        clienteIds.add(item.alvo.clienteId);
      } else {
        placasSemCliente.add(item.alvo.placa);
      }
    }
  }

  const escopos: FiltroAlvosCobranca[] = [...clienteIds]
    .map((clienteId) => ({ clienteId }))
    .sort((a, b) =>
      nomeClientePorId(a.clienteId!).localeCompare(nomeClientePorId(b.clienteId!), "pt-BR"),
    );

  for (const placa of [...placasSemCliente].sort((a, b) =>
    compactPlaca(a).localeCompare(compactPlaca(b)),
  )) {
    escopos.push({ placa });
  }

  return escopos;
}

/** Prefixo de arquivo/canvas: um relatório por cliente (sem placa no slug). */
function basenameSidecarCobranca(
  sidecar: CobrancaRelatorioSidecar,
  escopo: FiltroAlvosCobranca,
): string {
  const clienteSlug = slug(sidecar.cliente);
  const placaSlug = slug(sidecar.placa);
  if (escopo.clienteId != null && escopo.placa == null) {
    return `cobranca-${clienteSlug}`;
  }
  if (escopo.placa != null && escopo.clienteId == null) {
    return `cobranca-${placaSlug}`;
  }
  return `cobranca-${placaSlug}-${clienteSlug}`;
}

function salvarSidecarUnico(
  sidecar: CobrancaRelatorioSidecar,
  dir: string,
  escopo: FiltroAlvosCobranca,
): string[] {
  const basename = basenameSidecarCobranca(sidecar, escopo);
  const data = dataArquivoBr();
  const arquivo = path.join(dir, `${basename}-${data}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(sidecar, null, 2), "utf8");

  const paths = [arquivo];
  const totalPorTipo = new Map<string, number>();
  for (const msg of sidecar.mensagensWhatsApp) {
    totalPorTipo.set(msg.tipo, (totalPorTipo.get(msg.tipo) ?? 0) + 1);
  }
  const contagem = new Map<string, number>();
  for (const msg of sidecar.mensagensWhatsApp) {
    const idx = (contagem.get(msg.tipo) ?? 0) + 1;
    contagem.set(msg.tipo, idx);
    const total = totalPorTipo.get(msg.tipo) ?? 1;
    const sufixo = total > 1 ? `-${idx}` : "";
    const tipoSlug = slug(msg.tipo);
    const whatsappPath = path.join(
      dir,
      `${basename}-${data}-whatsapp-${tipoSlug}${sufixo}.txt`,
    );
    fs.writeFileSync(whatsappPath, ensureRodapeWhatsApp(msg.texto), "utf8");
    paths.push(whatsappPath);
  }
  return paths;
}

export function salvarCobrancasSidecar(
  results: LoteCobrancaResult[],
  dataReferencia: string,
  opts?: {
    outDir?: string;
    filtro?: FiltroAlvosCobranca;
    tiposSolicitados?: TipoCobrancaAction[];
  },
): string[] {
  const filtro = opts?.filtro ?? {};
  const escopos =
    filtro.clienteId != null || filtro.placa != null
      ? [filtro]
      : listarEscoposSidecar(results, filtro);
  if (escopos.length === 0) return [];

  const dir = opts?.outDir ?? COBRANCAS_OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });

  const paths: string[] = [];
  for (const escopo of escopos) {
    const items = itemsLoteDoEscopo(results, escopo);
    const sidecar = montarCobrancaSidecar(
      escopo,
      items,
      dataReferencia,
      opts?.tiposSolicitados,
    );
    if (!sidecar) continue;
    paths.push(...salvarSidecarUnico(sidecar, dir, escopo));
  }
  return paths;
}

export type GrupoCobrancaSimples = {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaRelatorioCobranca[];
  total: number;
};

export type CobrancaSimplesSidecar = {
  tipo: "cobranca-simples";
  modo: "por-tipo" | "por-placa";
  geradoEm: string;
  geradoEmBr: string;
  titulo: string;
  tipoDespesa?: string;
  placa?: string;
  grupos: GrupoCobrancaSimples[];
  totalGeral: number;
};

function linhasDeItem(item: LoteCobrancaItem): LinhaRelatorioCobranca[] {
  return item.alvo.despesas.map((d) => linhaDespesa(d));
}

function ordenarGruposSimples(grupos: GrupoCobrancaSimples[]): GrupoCobrancaSimples[] {
  return grupos
    .map((g) => ({
      ...g,
      linhas: ordenarLinhas(g.linhas),
      total: somaLinhas(g.linhas),
    }))
    .filter((g) => g.linhas.length > 0);
}

function modoSimplesParaMontagem(
  modo: Extract<ModoCanvasCobranca, "simples-tipo" | "simples-placa">,
): "por-tipo" | "por-placa" {
  return modo === "simples-tipo" ? "por-tipo" : "por-placa";
}

function tituloRelatorioSimplesPorTipo(rotulo: string): string {
  const nome = rotulo.charAt(0).toLowerCase() + rotulo.slice(1);
  return `Relatório de ${nome}`;
}

export function montarCobrancaSimplesSidecar(
  results: LoteCobrancaResult[],
  opts: {
    modo: "por-tipo" | "por-placa";
    filtro: FiltroAlvosCobranca;
    tiposSolicitados: TipoCobrancaAction[];
    dataReferencia: string;
  },
): CobrancaSimplesSidecar | null {
  const gruposRaw: GrupoCobrancaSimples[] = [];

  if (opts.modo === "por-tipo") {
    const tipo = opts.tiposSolicitados[0];
    if (!tipo) return null;
    const porPlaca = new Map<string, GrupoCobrancaSimples>();

    for (const result of results) {
      if (result.tipo !== tipo) continue;
      for (const item of result.items) {
        const placaFmt = formatPlacaHyphen(item.alvo.placa);
        const pKey = compactPlaca(placaFmt);
        const { modelo, ano } = veiculoInfo(placaFmt);
        let grupo = porPlaca.get(pKey);
        if (!grupo) {
          grupo = {
            titulo: `${placaFmt} · ${modelo} (${ano})`,
            subtitulo: item.alvo.clienteNome ?? undefined,
            linhas: [],
            total: 0,
          };
          porPlaca.set(pKey, grupo);
        }
        grupo.linhas.push(...linhasDeItem(item));
      }
    }

    gruposRaw.push(...porPlaca.values());
    const rotulo = ROTULO_TIPO_COBRANCA[tipo];
    const grupos = ordenarGruposSimples(gruposRaw).sort((a, b) =>
      a.titulo.localeCompare(b.titulo),
    );
    if (grupos.length === 0) return null;

    return {
      tipo: "cobranca-simples",
      modo: "por-tipo",
      geradoEm: new Date().toISOString(),
      geradoEmBr: hojeBr(),
      titulo: tituloRelatorioSimplesPorTipo(rotulo),
      tipoDespesa: tipo,
      grupos,
      totalGeral: round2(grupos.reduce((s, g) => s + g.total, 0)),
    };
  }

  const placaFmt = opts.filtro.placa ? formatPlacaHyphen(opts.filtro.placa) : "";
  if (!placaFmt) return null;
  const { modelo, ano } = veiculoInfo(placaFmt);
  const porTipo = new Map<string, GrupoCobrancaSimples>();

  for (const result of results) {
    if (!opts.tiposSolicitados.includes(result.tipo)) continue;
    const rotulo = ROTULO_TIPO_COBRANCA[result.tipo];
    let grupo = porTipo.get(result.tipo);
    if (!grupo) {
      grupo = { titulo: rotulo, linhas: [], total: 0 };
      porTipo.set(result.tipo, grupo);
    }
    for (const item of result.items) {
      if (compactPlaca(item.alvo.placa) !== compactPlaca(placaFmt)) continue;
      grupo.linhas.push(...linhasDeItem(item));
    }
  }

  const ordem = opts.tiposSolicitados.map((t) => ROTULO_TIPO_COBRANCA[t]);
  const grupos = ordenarGruposSimples([...porTipo.values()]).sort(
    (a, b) => ordem.indexOf(a.titulo) - ordem.indexOf(b.titulo),
  );
  if (grupos.length === 0) return null;

  return {
    tipo: "cobranca-simples",
    modo: "por-placa",
    geradoEm: new Date().toISOString(),
    geradoEmBr: hojeBr(),
    titulo: `Cobranças — ${placaFmt} · ${modelo} (${ano})`,
    placa: placaFmt,
    grupos,
    totalGeral: round2(grupos.reduce((s, g) => s + g.total, 0)),
  };
}

export function salvarCobrancaSimplesSidecar(
  results: LoteCobrancaResult[],
  dataReferencia: string,
  opts: {
    outDir?: string;
    filtro: FiltroAlvosCobranca;
    tiposSolicitados: TipoCobrancaAction[];
    modo: Extract<ModoCanvasCobranca, "simples-tipo" | "simples-placa">;
  },
): string[] {
  const sidecar = montarCobrancaSimplesSidecar(results, {
    modo: modoSimplesParaMontagem(opts.modo),
    filtro: opts.filtro,
    tiposSolicitados: opts.tiposSolicitados,
    dataReferencia,
  });
  if (!sidecar) return [];

  const dir = opts.outDir ?? COBRANCAS_OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });

  const arquivo =
    opts.modo === "simples-tipo" && sidecar.tipoDespesa
      ? path.join(
          dir,
          `cobranca-simples-${slug(sidecar.tipoDespesa)}-${dataArquivoBr()}.json`,
        )
      : path.join(
          dir,
          `cobranca-simples-${slug(sidecar.placa ?? "placa")}-${dataArquivoBr()}.json`,
        );

  fs.writeFileSync(arquivo, JSON.stringify(sidecar, null, 2), "utf8");
  return [arquivo];
}

export type RelatorioInfracoesSidecar = {
  tipo: "relatorio-infracoes";
  geradoEm: string;
  geradoEmBr: string;
  titulo: string;
  fonte: string;
  totalInfracoes: number;
  totalPlacas: number;
  totalGeral: number;
  totalCobravel: number;
  blocos: BlocoInfracoesRelatorio[];
};

export type LinhaInfracaoResumida = {
  auto: string;
  titulo: string;
  descricao: string;
  placa: string;
  data: string;
  situacao: SituacaoInfracaoResumida;
  valor: number;
};

export type GrupoInfracoesResumido = {
  titulo: string;
  contratoPlaca?: string;
  contratoMarcaModelo?: string;
  subtitulo?: string;
  linhas: LinhaInfracaoResumida[];
  total: number;
};

export type BlocoContratoInfracoesResumido = {
  id: "ativo" | "encerrado";
  titulo: string;
  qtd: number;
  total: number;
  grupos: GrupoInfracoesResumido[];
};

export type RelatorioInfracoesResumidoSidecar = {
  tipo: "relatorio-infracoes-resumido";
  geradoEm: string;
  geradoEmBr: string;
  titulo: string;
  blocos: BlocoContratoInfracoesResumido[];
  totalGeral: number;
};

type ItemInfracaoResumida = {
  reg: InfracaoRegistro;
  clienteId: string;
  despesa?: ClienteDespesaRegistro;
};

function mapaPagasLanzaResumido(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const d of loadClienteDespesasDb().clienteDespesas) {
    if (!isInfracaoTransito(d)) continue;
    const auto = String(d.numeroAuto ?? d.autoInfracao ?? "").trim().toUpperCase();
    if (!auto) continue;
    if (d.paga === true) map.set(auto, true);
  }
  return map;
}

function mapaDespesaPorAutoInfracao(): Map<string, ClienteDespesaRegistro> {
  const map = new Map<string, ClienteDespesaRegistro>();
  for (const d of loadClienteDespesasDb().clienteDespesas) {
    if (!isInfracaoTransito(d)) continue;
    const auto = String(d.numeroAuto ?? d.autoInfracao ?? "").trim().toUpperCase();
    if (!auto) continue;
    map.set(auto, d);
  }
  return map;
}

function veiculoParticularPorPlacaResumido(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const v of loadVeiculosDb().veiculos ?? []) {
    if (v.particular === true) out.set(compactPlaca(v.placa), true);
  }
  return out;
}

function infracaoDebitoParceiroResumido(
  reg: InfracaoRegistro,
  placaNorm: string,
  particulares: Map<string, boolean>,
): boolean {
  if (reg.condutorId) return false;
  if (reg.debitoParceiroConfirmado === true) return true;
  return particulares.get(placaNorm) === true;
}

function clienteIdentificadoInfracao(reg: InfracaoRegistro): string | null {
  if (reg.condutorId) return reg.condutorId;
  if (reg.condutorNaoIdentificado === true) return null;
  if (reg.condutorContrato && !reg.condutorId) return null;
  const data = String(reg.dataAutuacao ?? "").trim();
  if (!data || !parseDataAutuacao(data)) return null;
  return (
    inferirCondutorInfracao(formatPlacaHyphen(reg.veiculoId), reg.dataAutuacao, 90).condutorId ??
    null
  );
}

function rotuloInputInfracaoResumida(
  reg: InfracaoRegistro,
  despesa: ClienteDespesaRegistro | undefined,
  pagasLanza: Map<string, boolean>,
): RotuloGastoInput {
  const auto = String(reg.numeroAuto ?? "").trim().toUpperCase();
  return {
    categoria: "Infração",
    titulo: despesa?.titulo,
    descricao: reg.descricao,
    dataAutuacao: reg.dataAutuacao,
    numeroAuto: reg.numeroAuto,
    autoInfracao: reg.numeroAuto,
    paga: pagasLanza.get(auto) === true || despesa?.paga === true,
    situacao: despesa?.situacao ?? reg.situacao,
    statusInfracao: reg.statusInfracao,
    statusDetran: reg.statusDetran,
    quitadaDetran: reg.quitadaDetran,
  };
}

function linhaInfracaoResumidaFromItem(
  item: ItemInfracaoResumida,
  pagasLanza: Map<string, boolean>,
): LinhaInfracaoResumida {
  const { reg, despesa } = item;
  return {
    auto: String(reg.numeroAuto ?? "").trim() || "—",
    titulo: rotuloInfracaoCobranca(rotuloInputInfracaoResumida(reg, despesa, pagasLanza)),
    descricao: reg.descricao?.trim() || "—",
    placa: formatPlacaHyphen(reg.veiculoId),
    data: reg.dataAutuacao || "—",
    situacao: situacaoInfracaoResumida(reg, {
      pagaLanza: pagasLanza.get(String(reg.numeroAuto ?? "").trim().toUpperCase()) === true,
    }),
    valor: round2(Number(reg.valorMulta) || Number(reg.valor) || 0),
  };
}

function ordenarLinhasInfracaoResumida(
  linhas: LinhaInfracaoResumida[],
): LinhaInfracaoResumida[] {
  return [...linhas].sort(
    (a, b) =>
      compararDataBrAsc(a.data, b.data) ||
      a.placa.localeCompare(b.placa) ||
      a.auto.localeCompare(b.auto),
  );
}

function somaLinhasInfracaoResumida(linhas: LinhaInfracaoResumida[]): number {
  return round2(
    linhas.reduce((s, l) => (l.situacao === "Em aberto" ? s + l.valor : s), 0),
  );
}

function ordenarGruposInfracoesResumido(
  grupos: GrupoInfracoesResumido[],
): GrupoInfracoesResumido[] {
  return grupos
    .map((g) => {
      const linhas = ordenarLinhasInfracaoResumida(g.linhas);
      return { ...g, linhas, total: somaLinhasInfracaoResumida(linhas) };
    })
    .filter((g) => g.linhas.length > 0)
    .sort((a, b) => a.titulo.localeCompare(b.titulo));
}

function veiculosElegiveisResumidoInfracoes(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const v of loadVeiculosDb().veiculos) {
    if (v.particular === true) continue;
    map.set(compactPlaca(v.placa), true);
  }
  return map;
}

function nomeClienteResumidoInfracao(clienteId: string | null): string {
  if (!clienteId) return "— sem cliente";
  const c = loadClientesDb().clientes.find((x) => x.id === clienteId);
  return c?.nome?.trim() || "— sem cliente";
}

function clienteTemContratoAtivo(clienteId: string): boolean {
  return loadContratosDb().contratos.some(
    (c) => c.clienteId === clienteId && c.status === "ativo",
  );
}

function situacaoContratoClienteInfracao(clienteId: string | null): "ativo" | "encerrado" {
  if (!clienteId) return "encerrado";
  return clienteTemContratoAtivo(clienteId) ? "ativo" : "encerrado";
}

function ultimoEncerramentoCliente(clienteId: string | null): string | null {
  if (!clienteId) return "Sem contrato ativo";
  if (clienteTemContratoAtivo(clienteId)) return null;
  const encerrados = loadContratosDb().contratos.filter(
    (c) => c.clienteId === clienteId && c.status === "encerrado",
  );
  if (encerrados.length === 0) return "Sem contrato ativo";
  const recente = encerrados.sort(ordenarContratosRecentes)[0];
  return linhaEncerramentoContrato(recente) ?? "Sem contrato ativo";
}

function coletarInfracoesResumido(): ItemInfracaoResumida[] {
  const veiculos = veiculosElegiveisResumidoInfracoes();
  const particulares = veiculoParticularPorPlacaResumido();
  const despesas = mapaDespesaPorAutoInfracao();
  const vistos = new Set<string>();
  const out: ItemInfracaoResumida[] = [];

  for (const reg of loadInfracoesDb().infracoes ?? []) {
    if (reg.ativo === false) continue;
    const auto = String(reg.numeroAuto ?? "").trim().toUpperCase();
    if (!auto || vistos.has(auto)) continue;
    const placaNorm = compactPlaca(reg.veiculoId);
    if (!veiculos.has(placaNorm)) continue;
    if (infracaoDebitoParceiroResumido(reg, placaNorm, particulares)) continue;
    const clienteId = clienteIdentificadoInfracao(reg);
    if (!clienteId) continue;
    vistos.add(auto);
    out.push({ reg, clienteId, despesa: despesas.get(auto) });
  }

  return out;
}

function veiculoContratoCliente(clienteId: string | null): {
  placa?: string;
  marcaModelo?: string;
} {
  if (!clienteId) return {};
  const contratos = loadContratosDb().contratos.filter((c) => c.clienteId === clienteId);
  const ativos = contratos
    .filter((c) => c.status === "ativo")
    .sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  const ref =
    ativos[0] ??
    contratos.filter((c) => c.status === "encerrado").sort(ordenarContratosRecentes)[0];
  if (!ref) return {};
  const placa = formatPlacaHyphen(ref.placa ?? ref.veiculoId ?? "");
  if (!placa) return {};
  const v = loadVeiculosDb().veiculos.find(
    (x) => compactPlaca(x.placa) === compactPlaca(placa),
  );
  const marcaModelo = String(v?.marcaModelo ?? v?.modelo ?? "").trim();
  return { placa, marcaModelo: marcaModelo || undefined };
}

function subtituloGrupoInfracaoResumido(
  clienteId: string | null,
  linhas: LinhaInfracaoResumida[],
  veiculoContrato: { placa?: string; marcaModelo?: string },
): string | undefined {
  const partes: string[] = [];
  const placasInf = [...new Set(linhas.map((l) => l.placa).filter(Boolean))];
  const placaContrato = veiculoContrato.placa?.trim();
  const infForaContrato =
    placaContrato &&
    placasInf.some((p) => compactPlaca(p) !== compactPlaca(placaContrato));
  if (infForaContrato && placasInf.length > 0) {
    partes.push(`Infrações em: ${placasInf.join(", ")}`);
  }
  if (clienteId && !clienteTemContratoAtivo(clienteId)) {
    const enc = ultimoEncerramentoCliente(clienteId);
    if (enc) partes.push(enc);
  }
  return partes.length > 0 ? partes.join(" · ") : undefined;
}

const BLOCOS_CONTRATO_RESUMIDO: Array<{
  id: BlocoContratoInfracoesResumido["id"];
  titulo: string;
}> = [
  { id: "ativo", titulo: "Contrato ativo" },
  { id: "encerrado", titulo: "Contrato encerrado" },
];

function montarBlocosInfracoesResumido(
  _results?: LoteCobrancaResult[],
): BlocoContratoInfracoesResumido[] {
  const porClientePorBloco = new Map<
    BlocoContratoInfracoesResumido["id"],
    Map<string, { clienteId: string | null; clienteNome: string; linhas: LinhaInfracaoResumida[] }>
  >();
  for (const def of BLOCOS_CONTRATO_RESUMIDO) {
    porClientePorBloco.set(def.id, new Map());
  }

  const pagasLanza = mapaPagasLanzaResumido();

  for (const item of coletarInfracoesResumido()) {
    const clienteId = item.clienteId;
    const blocoId = situacaoContratoClienteInfracao(clienteId);
    const clienteNome = nomeClienteResumidoInfracao(clienteId);
    const clienteKey = clienteId ?? clienteNome;
    const mapa = porClientePorBloco.get(blocoId)!;
    let entrada = mapa.get(clienteKey);
    if (!entrada) {
      entrada = { clienteId, clienteNome, linhas: [] };
      mapa.set(clienteKey, entrada);
    }
    entrada.linhas.push(linhaInfracaoResumidaFromItem(item, pagasLanza));
  }

  return BLOCOS_CONTRATO_RESUMIDO.map((def) => {
    const mapa = porClientePorBloco.get(def.id)!;
    const grupos = ordenarGruposInfracoesResumido(
      [...mapa.values()].map((entrada) => {
        const linhas = ordenarLinhasInfracaoResumida(entrada.linhas);
        const veiculoContrato = veiculoContratoCliente(entrada.clienteId);
        return {
          titulo: entrada.clienteNome,
          contratoPlaca: veiculoContrato.placa,
          contratoMarcaModelo: veiculoContrato.marcaModelo,
          subtitulo: subtituloGrupoInfracaoResumido(
            entrada.clienteId,
            linhas,
            veiculoContrato,
          ),
          linhas,
          total: somaLinhasInfracaoResumida(linhas),
        };
      }),
    );
    const qtd = grupos.reduce((s, g) => s + g.linhas.length, 0);
    const total = round2(grupos.reduce((s, g) => s + g.total, 0));
    return { id: def.id, titulo: def.titulo, qtd, total, grupos };
  }).filter((b) => b.grupos.length > 0);
}

function montarGruposInfracoesPorCliente(
  results?: LoteCobrancaResult[],
): GrupoInfracoesResumido[] {
  return montarBlocosInfracoesResumido(results).flatMap((b) => b.grupos);
}

export type VarianteCanvasInfracoes = "completo" | "resumido" | "ambos";

/** `/relatorio-cobrancas infracoes` sem cliente/placa → layout global (não cobranca-simples). */
export function ehRelatorioInfracoesGlobal(
  tipos: TipoCobrancaAction[],
  filtro: FiltroAlvosCobranca,
): boolean {
  return (
    tipos.length === 1 &&
    tipos[0] === "infracoes" &&
    filtro.clienteId == null &&
    filtro.placa == null
  );
}

export function salvarRelatorioInfracoesSidecars(
  results: LoteCobrancaResult[],
  _dataReferencia: string,
  opts?: { outDir?: string; variante?: VarianteCanvasInfracoes },
): string[] {
  const blocosResumido = montarBlocosInfracoesResumido();
  const blocosDados = montarRelatorioInfracoesBlocos();
  const temCompleto = blocosDados.totalInfracoes > 0;
  const temResumido = blocosResumido.some((b) => b.grupos.length > 0);
  if (!temCompleto && !temResumido) return [];

  const totalGeralResumido = round2(
    blocosResumido.reduce((s, b) => s + b.total, 0),
  );
  const geradoEm = new Date().toISOString();
  const geradoEmBr = hojeBr();
  const variante = opts?.variante ?? "completo";

  const completo: RelatorioInfracoesSidecar = {
    tipo: "relatorio-infracoes",
    geradoEm,
    geradoEmBr,
    titulo: blocosDados.titulo,
    fonte: blocosDados.fonte,
    totalInfracoes: blocosDados.totalInfracoes,
    totalPlacas: blocosDados.totalPlacas,
    totalGeral: blocosDados.totalGeral,
    totalCobravel: blocosDados.totalCobravel,
    blocos: blocosDados.blocos,
  };

  const resumido: RelatorioInfracoesResumidoSidecar = {
    tipo: "relatorio-infracoes-resumido",
    geradoEm,
    geradoEmBr,
    titulo: "Relatório de infrações (resumido)",
    blocos: blocosResumido,
    totalGeral: totalGeralResumido,
  };

  const dir = opts?.outDir ?? COBRANCAS_OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const data = dataArquivoBr();
  const paths: string[] = [];

  if ((variante === "completo" || variante === "ambos") && temCompleto) {
    const p = path.join(dir, `relatorio-infracoes-${data}.json`);
    fs.writeFileSync(p, JSON.stringify(completo, null, 2), "utf8");
    paths.push(p);
  }
  if ((variante === "resumido" || variante === "ambos") && temResumido) {
    const p = path.join(dir, `relatorio-infracoes-resumido-${data}.json`);
    fs.writeFileSync(p, JSON.stringify(resumido, null, 2), "utf8");
    paths.push(p);
  }
  return paths;
}
