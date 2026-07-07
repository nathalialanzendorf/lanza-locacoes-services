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
  RODAPE_AUTOMATICO,
  formatIntroResumoAtrasoSemanal,
  gerarDespesasEmAberto,
} from "./cobrancas.js";
import {
  infracaoCobravelRelatorio,
  infracaoIncluirListagemDespesasRelatorio,
  infracaoIncluirListagemRelatorio,
  rotuloInfracaoCobranca,
} from "./infracaoTitulo.js";
import type { LoteCobrancaItem, LoteCobrancaResult } from "./cobrancasLote.js";
import { buildSemanalAtrasoParaEscopo } from "./cobrancasLote.js";
import type { FiltroAlvosCobranca, TipoCobrancaAction } from "./cobrancasAlvos.js";
import {
  contratoMaisRecentePar,
  loadContratosDb,
  type ContratoRegistro,
  type MotivoEncerramento,
} from "./contratosDb.js";
import { compararDataBrAsc, daysBetween, parseDataBr } from "./contratoExtrair.js";
import { isCreditoDevolucaoLocatario } from "./encerrarContrato.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { dataVencimentoSemanalBr } from "./pagamentoSemanal.js";
import {
  despesaSemanalElegivelRelatorio,
  formatResumoCobrancaSemanal,
  vencimentoSemanalElegivelCobranca,
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

function linhaDespesa(d: ClienteDespesaRegistro): LinhaRelatorioCobranca {
  const descricao = isInfracaoTransito(d)
    ? rotuloInfracaoCobranca(d)
    : d.descricao?.trim() || d.titulo?.trim() || "(sem descrição)";
  return {
    descricao,
    placa: formatPlacaHyphen(d.veiculoId),
    data: d.dataAutuacao || "—",
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
    if (!despesaAberta(d)) continue;
    if (isQuebraContrato(d)) continue;
    if (isCreditoDevolucaoLocatario(d)) continue;
    if (d.id && vistos.has(d.id)) continue;

    if (filtro.placa && compactPlaca(d.veiculoId) !== compactPlaca(filtro.placa)) {
      continue;
    }
    if (filtro.clienteId && !despesaDoCliente(d, filtro.clienteId)) {
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
    rastreavel: rastreavelLabel(d.veiculoId),
    data: d.dataAutuacao || "—",
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
  const idx = texto.lastIndexOf(RODAPE_AUTOMATICO);
  if (idx === -1) return texto.trimEnd();
  return texto.slice(0, idx).trimEnd();
}

/** Resumo semanal com destaque WhatsApp (totais por semana + total a devido). */
export function formatResumoSemanalWhatsApp(
  resumo: ResumoCobrancaSemanal,
  opts?: {
    tabelas?: TabelaCobrancaSemanal[];
    dataPagamentoBr?: string;
    totalGeral?: number;
    /** @deprecated Use totalGeral */
    totalDevido?: number;
  },
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
  /** Tipos pedidos na CLI — quando só `manutencao`, mantém mensagem dedicada (sem despesas em aberto). */
  tiposSolicitados?: TipoCobrancaAction[];
  /** Total cobrável — exclui infrações advertidas/quitadas no DETRAN. */
  totalDespesasEmAberto?: number;
};

function enriquecerMensagemSemanal(
  texto: string,
  resumo: ResumoCobrancaSemanal,
  tabelas: TabelaCobrancaSemanal[],
  dataPagamentoBr: string,
  totalGeral: number,
  placa: string,
  nomeCliente: string,
): string {
  const corpo = stripRodapeWhatsApp(texto);
  const intro = formatIntroResumoAtrasoSemanal(placa, { nome: nomeCliente });
  const blocoResumo = formatResumoSemanalWhatsApp(resumo, {
    tabelas,
    dataPagamentoBr,
    totalGeral,
  });
  return `${corpo}\n\n📊 *Resumo do atraso*\n${intro}\n\n${blocoResumo}\n\n${RODAPE_AUTOMATICO}\n`;
}

/** Mensagens WhatsApp separadas: pagamento semanal + despesas em aberto (e tipos dedicados quando aplicável). */
export function montarMensagensWhatsAppEscopo(
  opts: MontarMensagensWhatsAppOpts,
): Array<{ tipo: string; placa: string; titulo: string; texto: string }> {
  const out: Array<{ tipo: string; placa: string; titulo: string; texto: string }> = [];

  const soManutencao =
    opts.tiposSolicitados?.length === 1 && opts.tiposSolicitados[0] === "manutencao";
  const incluirDespesasEmAberto = !soManutencao && opts.despesasEmAberto.length > 0;

  const mensagens = incluirDespesasEmAberto
    ? opts.mensagens.filter((m) => m.tipo !== "manutencao")
    : opts.mensagens;

  for (const m of mensagens) {
    if (
      m.tipo === "pagamento-semanal" &&
      opts.resumoSemanal &&
      opts.tabelasSemanal?.length &&
      opts.dataPagamentoBr
    ) {
      out.push({
        ...m,
        texto: enriquecerMensagemSemanal(
          m.texto,
          opts.resumoSemanal,
          opts.tabelasSemanal,
          opts.dataPagamentoBr,
          opts.totalGeralSemanal ??
            opts.totalDevidoSemanal ??
            opts.resumoSemanal.totalReceber,
          opts.placa,
          opts.nomeCliente,
        ),
      });
    } else {
      out.push(m);
    }
  }

  if (!incluirDespesasEmAberto) return out;

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

  return out;
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
  const infracoes: LinhaRelatorioCobranca[] = infracoesRelatorio.map((d) => linhaDespesa(d));
  const manutencoes: LinhaRelatorioCobranca[] = [];
  const parcelasEmAberto: LinhaRelatorioCobranca[] = [];
  const debitosDiversos: LinhaRelatorioCobranca[] = [];

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

  const placasLote = [...new Set(itemsLote.map((i) => formatPlacaHyphen(i.alvo.placa)))];
  if (placasLote.length === 1) return placasLote[0]!;
  if (placasLote.length > 1) {
    const comContrato = placasLote.filter((p) => {
      const c = contratoReferenciaCobranca(p, filtro.clienteId);
      return c?.clienteId === filtro.clienteId;
    });
    if (comContrato.length === 1) return comContrato[0]!;
  }

  if (filtro.clienteId) {
    const ultimo = ultimoContratoPorCliente(filtro.clienteId);
    if (ultimo?.placa) return formatPlacaHyphen(ultimo.placa);
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

    const venc =
      dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao;
    if (
      venc &&
      !vencimentos.includes(venc) &&
      vencimentoSemanalElegivelCobranca(venc, hojeBr)
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
  const totalInfracoes = round2(
    infracoesDb
      .filter((d) => infracaoCobravelRelatorio(d))
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
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

  mensagensWhatsApp = montarMensagensWhatsAppEscopo({
    mensagens: mensagensWhatsApp,
    despesasEmAberto,
    placa,
    nomeCliente: cliente,
    resumoSemanal: parseResumoSemanal(resumoSemanal),
    tabelasSemanal,
    dataPagamentoBr,
    totalGeralSemanal:
      typeof pagamentoSemanal?.totalGeral === "number"
        ? pagamentoSemanal.totalGeral
        : undefined,
    tiposSolicitados,
    totalDespesasEmAberto,
  });

  const { modelo, ano } = veiculoInfo(placa);
  const dataAtual = hojeBr();
  const vigencia = contratoInfo(placa, clienteId, dataAtual);

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

export function salvarCobrancasSidecar(
  results: LoteCobrancaResult[],
  dataReferencia: string,
  opts?: {
    outDir?: string;
    filtro?: FiltroAlvosCobranca;
    tiposSolicitados?: TipoCobrancaAction[];
  },
): string[] {
  const filtro = opts?.filtro;
  if (!filtro?.clienteId && !filtro?.placa) return [];

  const dir = opts?.outDir ?? COBRANCAS_OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });

  const items = itemsLoteDoEscopo(results, filtro);
  const sidecar = montarCobrancaSidecar(
    filtro,
    items,
    dataReferencia,
    opts?.tiposSolicitados,
  );
  if (!sidecar) return [];

  const placaSlug = slug(sidecar.placa);
  const clienteSlug = slug(sidecar.cliente);
  const arquivo = path.join(
    dir,
    `cobranca-${placaSlug}-${clienteSlug}-${dataArquivoBr()}.json`,
  );
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
      `cobranca-${placaSlug}-${clienteSlug}-${dataArquivoBr()}-whatsapp-${tipoSlug}${sufixo}.txt`,
    );
    fs.writeFileSync(whatsappPath, msg.texto, "utf8");
    paths.push(whatsappPath);
  }
  return paths;
}
