/**
 * Monta o plano de baixa de recebimento (pré-visualização — não grava).
 * Usado pela skill cadastro-recebimento (modo unitário e lote PagBank).
 */
import {
  despesaAtribuidaACliente,
  isClienteDespesaEmAberto,
  isLocacaoSemanalEmAberto,
  loadClienteDespesasDb,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
} from "../clienteDespesasDb.js";
import { loadClientesDb, normNomeKey, type ClienteRegistro } from "../clientesDb.js";
import {
  loadCobrancasDbContextAsync,
  loadBaixaPlanoDbContextAsync,
  loadPlanoBaixaCtxDireto,
  setCobrancasRuntimeCtx,
  type CobrancasDbContext,
  type CobrancasScopedContextInput,
} from "../cobrancasDbContext.js";
import { logFlowStep, resetSqlSeq, getDbBackend } from "@lanza/db";
import { isEntityUuid } from "../filtroListagem.js";
import { compararDataBrAsc } from "../contratoExtrair.js";
import { loadContratosDb, contratoMaisRecentePar } from "../contratosDb.js";
import {
  dataBrComHora,
  dataVencimentoSemanalBr,
  isPagamentoSemanalDescricao,
  proximaParcelaSemanal,
  stripAtrasadoSemanal,
} from "../pagamentoSemanal.js";
import {
  deveExibirCalculoSemanalAtraso,
  montarPacoteCobrancaSemanalAtraso,
} from "../pagamentoSemanalCobranca.js";
import { compactPlaca, formatPlacaHyphen, placasIguais } from "../placa.js";
import {
  findVeiculoInDb,
  loadVeiculosDb,
  type VeiculoRegistro,
} from "../veiculosDb.js";
import {
  verificarIdempotenciaBaixa,
  type IdempotenciaBaixa,
} from "./idempotenciaBaixa.js";
export type { IdempotenciaStatus } from "./idempotenciaBaixa.js";
import { StatusContrato, CategoriaDespesaCliente } from "../domain/index.js";

export type LinhaPlanoBaixa = {
  num: number;
  operacao: "atualizar" | "criar";
  autoInfracao: string | null;
  /** UUID da despesa alvo (preferir sobre autoInfracao na execução). */
  despesaId?: string | null;
  /** UUID do cliente — escopo Postgres. */
  clienteId?: string | null;
  /** UUID do veículo — escopo Postgres. */
  veiculoId?: string | null;
  data: string;
  descricao: string;
  tipo: string;
  total: number;
  patch?: ClienteDespesaPatch;
  comprovanteRastreame?: string | null;
  /** Referência externa (ex.: id PagBank) — só informativo. */
  origemExterna?: string | null;
};

export type PlanoBaixaRecebimento = {
  cliente: { id: string; cpf: string | null };
  pagamento: {
    valor: number;
    dataBr: string;
    horaBr: string | null;
    pagaEmIso: string;
  };
  despesaAlvo: {
    autoInfracao: string;
    descricaoAtual: string;
    valorDevido: number;
    dataVencimento: string;
    veiculoId: string;
    /** Dias entre recebimento e vencimento previsto (+ = após vencimento). */
    diasDoVencimento: number | null;
  } | null;
  tipoBaixa: "integral" | "parcial" | "integral_desconto";
  linhas: LinhaPlanoBaixa[];
  avisos: string[];
  /** Match PagBank: operador deve confirmar manualmente antes de gravar. */
  revisaoManual?: boolean;
  /** Pagamento ou despesa alvo já existente no database — confirmar antes de gravar. */
  idempotencia?: IdempotenciaBaixa;
  /** Tabela de juros/multa semanal — omitida só se pagamento na data de vencimento. */
  calculoSemanalAtraso?: CalculoSemanalAtrasoPlano | null;
};

export type CalculoSemanalAtrasoPlano = {
  exibir: boolean;
  markdown: string;
  totalGeral: number;
  valorNominal: number;
  payload: Record<string, unknown>;
};

type VeiculoDb = Pick<VeiculoRegistro, "placa" | "id" | "rastreameLabel" | "rastreameRastreavelKey">;

let _baixaPlanoCtx: CobrancasDbContext | null = null;

function exigeCtxBaixa(campo: string): never {
  throw new Error(
    `Contexto de baixa não carregado (${campo}). Use montarPlanoBaixaAsync ou withBaixaPlanoDbContext.`,
  );
}

function clientesList(): ClienteRegistro[] {
  if (_baixaPlanoCtx) return _baixaPlanoCtx.clientes;
  if (getDbBackend() !== "file") exigeCtxBaixa("clientes");
  return loadClientesDb().clientes;
}

function veiculosList(): VeiculoDb[] {
  if (_baixaPlanoCtx) return _baixaPlanoCtx.veiculos;
  if (getDbBackend() !== "file") exigeCtxBaixa("veiculos");
  return loadVeiculosDb().veiculos;
}

function contratosList() {
  if (_baixaPlanoCtx) return _baixaPlanoCtx.contratos;
  if (getDbBackend() !== "file") exigeCtxBaixa("contratos");
  return loadContratosDb().contratos;
}

function clienteDespesasList(): ClienteDespesaRegistro[] {
  if (_baixaPlanoCtx) return _baixaPlanoCtx.clienteDespesas;
  if (getDbBackend() !== "file") exigeCtxBaixa("clienteDespesas");
  return loadClienteDespesasDb().clienteDespesas;
}

function atribuicaoDespesaCtx() {
  return {
    contratos: contratosList(),
    veiculos: veiculosList(),
  };
}

function findVeiculoLocal(placa: string): VeiculoDb | null {
  return veiculosList().find((v) => placasIguais(v.placa, placa)) ?? null;
}

function findVeiculoPorReferencia(ref: string): VeiculoDb | null {
  const raw = ref.trim();
  if (!raw) return null;
  return findVeiculoInDb({ veiculos: veiculosList() }, raw);
}

/** Placa canônica — resolve UUID/id do veículo via catálogo (Postgres grava veiculo_id). */
function resolvePlacaReferencia(veiculoIdRaw: string): string {
  const v = findVeiculoPorReferencia(veiculoIdRaw);
  if (v?.placa?.trim()) return formatPlacaHyphen(v.placa);
  return formatPlacaHyphen(veiculoIdRaw);
}

function resolvePlacaDespesa(d: ClienteDespesaRegistro): string {
  return resolvePlacaReferencia(String(d.veiculoId ?? ""));
}

function despesaPlacaIgual(d: ClienteDespesaRegistro, placa: string): boolean {
  if (!placa.trim()) return true;
  return placasIguais(resolvePlacaDespesa(d), placa);
}

function despesaVeiculoRefIgual(d: ClienteDespesaRegistro, veiculoRef: string): boolean {
  if (!veiculoRef.trim()) return true;
  const ref = veiculoRef.trim();
  const dVeiculo = String(d.veiculoId ?? "").trim();
  if (dVeiculo && dVeiculo.toLowerCase() === ref.toLowerCase()) return true;
  const vRef = findVeiculoPorReferencia(ref);
  const vDesp = findVeiculoPorReferencia(dVeiculo);
  if (vRef?.id && vDesp?.id && vRef.id.toLowerCase() === vDesp.id.toLowerCase()) return true;
  if (vRef?.id && dVeiculo.toLowerCase() === vRef.id.toLowerCase()) return true;
  return despesaPlacaIgual(d, ref);
}

function despesaEmAberto(d: ClienteDespesaRegistro): boolean {
  return isClienteDespesaEmAberto(d);
}

function correspondeAlvoExplicito(d: ClienteDespesaRegistro, alvoId: string): boolean {
  const key = alvoId.trim();
  if (!key) return false;
  const keyLower = key.toLowerCase();
  if (String(d.id ?? "").trim().toLowerCase() === keyLower) return true;
  const auto = String(d.autoInfracao ?? "").trim();
  return auto.toLowerCase() === keyLower;
}

function findVeiculoByRastreameKeyLocal(key: string | number): VeiculoDb | null {
  const k = String(key);
  return (
    veiculosList().find(
      (v) => v.rastreameRastreavelKey != null && String(v.rastreameRastreavelKey) === k,
    ) ?? null
  );
}

function contratoAtivoVeiculo(veiculoId: string, clienteId: string) {
  const p = compactPlaca(resolvePlacaReferencia(veiculoId));
  const list = contratosList().filter(
    (c) => c.status === StatusContrato.Ativo && compactPlaca(c.placa ?? "") === p,
  );
  const par = list.find((c) => c.clienteId === clienteId);
  if (par) return par;
  list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return list[0] ?? null;
}

/** Contrato ativo do par; se encerrado, usa o mais recente (ex-locatário devendo). */
function contratoReferenciaSemanalAtraso(veiculoId: string, clienteId: string) {
  const ativo = contratoAtivoVeiculo(veiculoId, clienteId);
  if (ativo) return ativo;
  const placa = resolvePlacaReferencia(veiculoId);
  const encerrado = contratoMaisRecentePar({ placa, clienteId }, contratosList());
  return encerrado?.status === StatusContrato.Encerrado ? encerrado : null;
}

function vencimentosSemanalAbertosCliente(clienteId: string, placaOuVeiculoId?: string): string[] {
  const placaFiltro = placaOuVeiculoId?.trim()
    ? resolvePlacaReferencia(placaOuVeiculoId)
    : null;
  const atribuicaoCtx = atribuicaoDespesaCtx();
  const vencs = clienteDespesasList()
    .filter(
      (d) =>
        despesaAtribuidaACliente(d, clienteId, 90, atribuicaoCtx) &&
        isLocacaoSemanalEmAberto(d) &&
        isPagamentoSemanalDescricao(d.descricao ?? "") &&
        (!placaFiltro || placasIguais(resolvePlacaDespesa(d), placaFiltro)),
    )
    .map((d) => dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao)
    .filter(Boolean) as string[];

  return [...new Set(vencs)].sort(compararDataBrAsc);
}

function montarCalculoSemanalAtrasoPlano(opts: {
  clienteId: string;
  clienteNome: string;
  veiculoId: string;
  dataPagamentoBr: string;
  valorNominal: number;
}): CalculoSemanalAtrasoPlano | null {
  const vencimentosBr = vencimentosSemanalAbertosCliente(opts.clienteId, opts.veiculoId);
  if (
    vencimentosBr.length === 0 ||
    !deveExibirCalculoSemanalAtraso(opts.dataPagamentoBr, vencimentosBr, false)
  ) {
    return null;
  }

  const contrato = contratoReferenciaSemanalAtraso(opts.veiculoId, opts.clienteId);
  if (contrato?.valorSemanal == null || contrato?.valorDiaria == null) {
    return null;
  }

  const pacote = montarPacoteCobrancaSemanalAtraso({
    valorSemanal: contrato.valorSemanal,
    valorDiaria: contrato.valorDiaria,
    vencimentosBr,
    dataPagamentoBr: opts.dataPagamentoBr,
    emAberto: false,
    clienteNome: opts.clienteNome,
    placa: resolvePlacaReferencia(opts.veiculoId),
    clienteId: opts.clienteId,
  });
  if (!pacote) return null;

  return {
    exibir: true,
    markdown: pacote.markdown,
    totalGeral: pacote.totalGeral,
    valorNominal: opts.valorNominal,
    payload: pacote.payload,
  };
}

export function rastreavelLabel(veiculoId: string): string {
  const v = veiculosList().find((x) => x.placa === veiculoId || x.id === veiculoId);
  return v?.rastreameLabel ?? veiculoId;
}

/** Placa para gravar despesa a partir de linha do plano (veiculoId UUID ou placa). */
export function resolvePlacaLinhaPlanoBaixa(linha: LinhaPlanoBaixa): string {
  const fromPatch = linha.patch?.veiculoId?.trim();
  if (fromPatch) {
    const v = findVeiculoLocal(fromPatch);
    return v?.placa ?? formatPlacaHyphen(fromPatch);
  }

  const fromLinha = linha.veiculoId?.trim();
  if (fromLinha) {
    const v = findVeiculoLocal(fromLinha);
    return v?.placa ?? formatPlacaHyphen(fromLinha);
  }

  const rKey = linha.patch?.rastreameRastreavelKey;
  if (rKey != null && String(rKey).trim() !== "") {
    const v = findVeiculoByRastreameKeyLocal(rKey);
    if (v?.placa) return v.placa;
  }

  throw new Error(
    `Veículo não encontrado para a linha ${linha.num}: informe veiculoId (UUID) na linha do plano.`,
  );
}

export function tipoRastreame(categoria?: string): string {
  switch (categoria) {
    case CategoriaDespesaCliente.Renegociacao:
      return "DOCUMENTACAO";
    case CategoriaDespesaCliente.Pedagio:
    case "Pedágio Digital":
    case CategoriaDespesaCliente.Estacionamento:
      return "PEDAGIO";
    case CategoriaDespesaCliente.Infracao:
      return "MULTA";
    case CategoriaDespesaCliente.Manutencao:
      return "ALIMENTACAO";
    default:
      return "OUTROS";
  }
}

/** Resolve cliente por nome parcial, CPF ou id. */
export function resolverCliente(query: string): ClienteRegistro {
  const q = query.trim();
  if (!q) throw new Error("Informe --cliente (nome, CPF ou id).");

  const list = clientesList();
  const key = q.replace(/\D/g, "");
  if (key.length === 11) {
    const byCpf = list.find((c) => c.cpf?.replace(/\D/g, "") === key);
    if (byCpf) return byCpf;
  }

  const qLower = q.toLowerCase();
  const byId = list.find((c) => c.id?.toLowerCase() === qLower);
  if (byId) return byId;

  const nk = normNomeKey(q);
  const matches = list.filter((c) => {
    const cn = normNomeKey(c.nome);
    return cn.includes(nk) || nk.includes(cn);
  });
  if (matches.length === 0) {
    throw new Error(`Cliente "${query}" não encontrado em clientes.json.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Vários clientes para "${query}": ${matches.map((m) => `${m.nome} (${m.cpf})`).join("; ")} — refine o nome ou use CPF.`,
    );
  }
  return matches[0]!;
}

export function parseValorInput(raw: string): number {
  const n = Number(String(raw).replace(/\./g, "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Valor inválido: ${raw}`);
  }
  return Math.round(n * 100) / 100;
}

/** DD/MM/AAAA ou DD/MM (ano corrente) ou AAAA-MM-DD. */
export function parseDataBr(raw: string, anoPadrao?: number): string {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[3]}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const y = anoPadrao ?? new Date().getFullYear();
    return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${y}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  throw new Error(`Data inválida: ${raw} (use DD/MM/AAAA ou DD/MM).`);
}

/** HH:MM ou HH:MM:SS */
export function parseHoraBr(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Hora inválida: ${raw} (use HH:MM).`);
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export function dataHoraToPagaEmIso(dataBr: string, horaBr: string | null): string {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Data inválida: ${dataBr}`);
  const [hh, mm] = (horaBr ?? "12:00").split(":").map((x) => x.padStart(2, "0"));
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:00-03:00`).toISOString();
}

function despesasAbertasCliente(clienteId: string, opts?: { excluirCategorias?: string[] }): ClienteDespesaRegistro[] {
  const excluir = new Set(opts?.excluirCategorias ?? []);
  const atribuicaoCtx = atribuicaoDespesaCtx();
  return clienteDespesasList()
    .filter(
      (d) =>
        despesaAtribuidaACliente(d, clienteId, 90, atribuicaoCtx) &&
        isClienteDespesaEmAberto(d) &&
        !excluir.has(d.categoria ?? ""),
    )
    .sort((a, b) => compararDataBrAsc(a.dataAutuacao, b.dataAutuacao));
}

function parseDataBrToMs(dataBr: string): number | null {
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Dias entre data do recebimento e vencimento previsto (+ = recebeu depois). */
export function diasDoVencimento(dataRecebimentoBr: string, dataVencimentoBr: string): number | null {
  const r = parseDataBrToMs(dataRecebimentoBr);
  const v = parseDataBrToMs(dataVencimentoBr);
  if (r == null || v == null) return null;
  return Math.round((r - v) / 86_400_000);
}

function dataPrevistaPagamento(d: ClienteDespesaRegistro): string {
  if (d.categoria === CategoriaDespesaCliente.LocacaoSemanal && isPagamentoSemanalDescricao(d.descricao)) {
    return dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao;
  }
  return d.dataAutuacao;
}

function janelaDiasDespesa(d: ClienteDespesaRegistro): { min: number; max: number } {
  if (d.categoria === CategoriaDespesaCliente.LocacaoSemanal && isPagamentoSemanalDescricao(d.descricao)) {
    return { min: -7, max: 14 };
  }
  return { min: -45, max: 45 };
}

function dentroDaJanela(delta: number, d: ClienteDespesaRegistro): boolean {
  const { min, max } = janelaDiasDespesa(d);
  return delta >= min && delta <= max;
}

function escolherDespesaAlvo(
  abertas: ClienteDespesaRegistro[],
  valor: number,
  dataRecebimentoBr: string,
): ClienteDespesaRegistro | null {
  const semanais = abertas.filter((d) => isLocacaoSemanalEmAberto(d));
  const pool = semanais.length > 0 ? semanais : abertas;
  if (pool.length === 0) return null;

  type Scored = {
    d: ClienteDespesaRegistro;
    delta: number;
    absDelta: number;
    venc: string;
  };

  const scored: Scored[] = pool.map((d) => {
    const venc = dataPrevistaPagamento(d);
    const delta = diasDoVencimento(dataRecebimentoBr, venc) ?? 9999;
    return { d, delta, absDelta: Math.abs(delta), venc };
  });

  const inWindow = scored.filter((s) => dentroDaJanela(s.delta, s.d));
  if (semanais.length > 0 && inWindow.length === 0) {
    return null;
  }

  const candidates = inWindow.length > 0 ? inWindow : scored;

  candidates.sort((a, b) => {
    const aExato = Math.abs(a.d.valorMulta - valor) < 0.01 ? 0 : 1;
    const bExato = Math.abs(b.d.valorMulta - valor) < 0.01 ? 0 : 1;
    if (aExato !== bExato) return aExato - bExato;
    if (a.absDelta !== b.absDelta) return a.absDelta - b.absDelta;
    if (a.delta >= 0 && b.delta < 0) return -1;
    if (b.delta >= 0 && a.delta < 0) return 1;
    return a.venc.localeCompare(b.venc);
  });

  return candidates[0]?.d ?? null;
}

function resolverDespesaAlvo(
  abertas: ClienteDespesaRegistro[],
  opts: {
    despesaId?: string | null;
    veiculoId?: string | null;
    placa?: string | null;
    valor: number;
    dataRecebimentoBr: string;
  },
): ClienteDespesaRegistro | null {
  const veiculoRef = opts.veiculoId?.trim() || opts.placa?.trim() || "";
  const alvoId = opts.despesaId?.trim();
  if (alvoId) {
    const candidato =
      clienteDespesasList().find((d) => correspondeAlvoExplicito(d, alvoId)) ??
      abertas.find((d) => correspondeAlvoExplicito(d, alvoId)) ??
      null;
    if (!candidato) {
      throw new Error(`Despesa não encontrada: ${alvoId}.`);
    }
    if (!despesaEmAberto(candidato)) {
      throw new Error(
        `Despesa ${alvoId} não está em aberto (${candidato.paga ? "já quitada" : "inativa"}).`,
      );
    }
    return candidato;
  }

  const pool = veiculoRef
    ? abertas.filter((d) => despesaVeiculoRefIgual(d, veiculoRef))
    : abertas;
  return escolherDespesaAlvo(pool, opts.valor, opts.dataRecebimentoBr);
}

function previewProximaParcela(
  pago: ClienteDespesaRegistro,
  descricaoAntes: string,
  valorParcela: number,
  clienteId: string,
): LinhaPlanoBaixa | null {
  const vencimentoAntes =
    pago.categoria === CategoriaDespesaCliente.LocacaoSemanal && isPagamentoSemanalDescricao(descricaoAntes)
      ? dataVencimentoSemanalBr(descricaoAntes, pago.rastreameDataIso) ?? pago.dataAutuacao
      : pago.dataAutuacao;
  const prox = proximaParcelaSemanal(descricaoAntes, vencimentoAntes);
  if (!prox) return null;

  const alvo = stripAtrasadoSemanal(prox.descricao).toLowerCase();
  const dup = clienteDespesasList().some(
    (d) =>
      isClienteDespesaEmAberto(d) &&
      d.veiculoId === pago.veiculoId &&
      d.categoria === CategoriaDespesaCliente.LocacaoSemanal &&
      stripAtrasadoSemanal(d.descricao).toLowerCase() === alvo,
  );
  if (dup) return null;

  return {
    num: 0,
    operacao: "criar",
    autoInfracao: null,
    clienteId,
    veiculoId: pago.veiculoId,
    data: prox.dataAutuacao,
    descricao: prox.descricao,
    tipo: tipoRastreame(pago.categoria),
    total: valorParcela,
    patch: {
      descricao: prox.descricao,
      valorMulta: valorParcela,
      dataAutuacao: prox.dataAutuacao,
      condutorId: clienteId,
      veiculoId: pago.veiculoId,
      paga: false,
      situacao: "Em aberto",
      categoria: pago.categoria,
      rastreameMotoristaKey: pago.rastreameMotoristaKey,
      rastreameRastreavelKey: pago.rastreameRastreavelKey,
      rastreameDataIso: prox.rastreameDataIso,
      rastreameTipo: pago.rastreameTipo ?? "OUTROS",
    },
  };
}

/** Normaliza entrada de escopo: nome/placa legados → clienteQuery/placa. */
export function normalizeBaixaScopeInput(
  input: CobrancasScopedContextInput,
): CobrancasScopedContextInput {
  const rawCliente = input.clienteId?.trim() || "";
  const rawVeiculo = input.veiculoId?.trim() || "";
  const clienteId = isEntityUuid(rawCliente) ? rawCliente : null;
  const veiculoId = isEntityUuid(rawVeiculo) ? rawVeiculo : null;
  const clienteQuery =
    input.clienteQuery?.trim() || (!clienteId && rawCliente ? rawCliente : undefined);
  const placa =
    input.placa?.trim() || (!veiculoId && rawVeiculo ? rawVeiculo : undefined);
  return {
    ...(clienteId ? { clienteId } : {}),
    ...(clienteQuery ? { clienteQuery } : {}),
    ...(veiculoId ? { veiculoId } : {}),
    ...(placa ? { placa } : {}),
    ...(input.despesaId?.trim() ? { despesaId: input.despesaId.trim() } : {}),
  };
}

export type MontarPlanoBaixaInput = {
  clienteId?: string | null;
  /** @deprecated prefer clienteId */
  clienteQuery?: string | null;
  valor: number;
  dataBr: string;
  horaBr?: string | null;
  comprovante?: string | null;
  /** Força baixa integral com valor menor que o devido (desconto). */
  desconto?: boolean;
  origemExterna?: string | null;
  /** Ex.: omitir Infração no match automático PagBank (Juliano). */
  excluirCategoriasAuto?: string[];
  revisaoManual?: boolean;
  /** Despesa em aberto alvo (id) — pendência escolhida na UI. */
  despesaId?: string | null;
  /** Restringe match automático ao veículo (UUID ou placa). */
  veiculoId?: string | null;
  /** @deprecated prefer veiculoId */
  placa?: string | null;
};

function resolverClientePlano(input: MontarPlanoBaixaInput): ClienteRegistro {
  const id = input.clienteId?.trim();
  if (id) {
    const byId = clientesList().find((c) => c.id?.toLowerCase() === id.toLowerCase());
    if (byId) return byId;
    throw new Error(`Cliente id "${id}" não encontrado.`);
  }
  if (input.clienteQuery?.trim()) return resolverCliente(input.clienteQuery);
  throw new Error('Informe "clienteId" ou "clienteQuery".');
}

export function montarPlanoBaixa(input: MontarPlanoBaixaInput): PlanoBaixaRecebimento {
  const cliente = resolverClientePlano(input);
  const dataBr = parseDataBr(input.dataBr);
  const horaBr = parseHoraBr(input.horaBr);
  const pagaEmIso = dataHoraToPagaEmIso(dataBr, horaBr);
  const valor = input.valor;
  const avisos: string[] = [];

  const abertas = input.despesaId?.trim()
    ? []
    : despesasAbertasCliente(cliente.id!, {
        excluirCategorias: input.excluirCategoriasAuto,
      });
  const alvo = resolverDespesaAlvo(abertas, {
    despesaId: input.despesaId,
    veiculoId: input.veiculoId,
    placa: input.placa,
    valor,
    dataRecebimentoBr: dataBr,
  });

  if (input.despesaId?.trim() && !alvo) {
    throw new Error(`Despesa não encontrada: ${input.despesaId.trim()}.`);
  }

  if (!alvo) {
    return {
      cliente: { id: cliente.id!, cpf: cliente.cpf ?? null },
      pagamento: { valor, dataBr, horaBr, pagaEmIso },
      despesaAlvo: null,
      tipoBaixa: "integral",
      linhas: [],
      avisos: [
        abertas.length > 0
          ? `Nenhuma despesa em aberto com vencimento próximo à data do recebimento (${dataBr}).`
          : "Nenhuma despesa em aberto encontrada para este cliente.",
      ],
    };
  }

  const escopoClienteId = cliente.id!;
  const escopoVeiculoId = alvo.veiculoId;
  const tipo = tipoRastreame(alvo.categoria);
  const valorDevido = alvo.valorMulta;
  const vencimento =
    alvo.categoria === CategoriaDespesaCliente.LocacaoSemanal && isPagamentoSemanalDescricao(alvo.descricao)
      ? dataVencimentoSemanalBr(alvo.descricao, alvo.rastreameDataIso) ?? alvo.dataAutuacao
      : alvo.dataAutuacao;
  const deltaVenc = diasDoVencimento(dataBr, vencimento);

  if (deltaVenc != null && !dentroDaJanela(deltaVenc, alvo)) {
    const { min, max } = janelaDiasDespesa(alvo);
    avisos.push(
      `Recebimento (${dataBr}) fora da janela do vencimento (${vencimento}): ${deltaVenc}d (aceite ${min}..${max}).`,
    );
  } else if (deltaVenc != null && deltaVenc > 0) {
    avisos.push(`Recebimento ${deltaVenc} dia(s) após o vencimento previsto (${vencimento}).`);
  }

  const diff = Math.round((valorDevido - valor) * 100) / 100;
  let tipoBaixa: PlanoBaixaRecebimento["tipoBaixa"];

  if (input.despesaId?.trim() && valor > valorDevido + 0.009) {
    throw new Error(
      `Valor recebido (R$ ${valor.toFixed(2)}) não pode ser maior que o devido (R$ ${valorDevido.toFixed(2)}) na despesa ${alvo.autoInfracao}.`,
    );
  }

  if (Math.abs(diff) < 0.01) {
    tipoBaixa = "integral";
  } else if (valor < valorDevido && (input.desconto || input.comprovante)) {
    tipoBaixa = "integral_desconto";
    avisos.push(
      `Valor pago (R$ ${valor.toFixed(2)}) menor que devido (R$ ${valorDevido.toFixed(2)}) — tratado como integral com desconto.`,
    );
  } else if (valor < valorDevido) {
    tipoBaixa = "parcial";
    avisos.push(
      `Pagamento parcial: R$ ${valor.toFixed(2)} quitado (nova linha) + R$ ${diff.toFixed(2)} permanece em atraso na despesa ${alvo.autoInfracao}.`,
    );
  } else {
    tipoBaixa = "integral";
    if (valor > valorDevido) {
      avisos.push(
        `Valor pago (R$ ${valor.toFixed(2)}) maior que devido (R$ ${valorDevido.toFixed(2)}); baixa integral na despesa ${alvo.autoInfracao}.`,
      );
    }
  }

  const linhas: LinhaPlanoBaixa[] = [];
  const descricaoAntes = alvo.descricao;

  if (tipoBaixa === "parcial") {
    const saldo = Math.round((valorDevido - valor) * 100) / 100;
    const descQuitada = stripAtrasadoSemanal(descricaoAntes);
    linhas.push({
      num: 1,
      operacao: "atualizar",
      autoInfracao: alvo.autoInfracao,
      despesaId: alvo.id,
      clienteId: escopoClienteId,
      veiculoId: escopoVeiculoId,
      data: vencimento,
      descricao: descricaoAntes,
      tipo,
      total: saldo,
      patch: {
        condutorId: escopoClienteId,
        veiculoId: escopoVeiculoId,
        valorMulta: saldo,
        paga: false,
        situacao: "Em aberto",
      },
      origemExterna: input.origemExterna,
    });
    const dataPagamento = dataBrComHora(dataBr, horaBr);
    linhas.push({
      num: 2,
      operacao: "criar",
      autoInfracao: null,
      clienteId: escopoClienteId,
      veiculoId: escopoVeiculoId,
      data: dataPagamento,
      descricao: descQuitada,
      tipo,
      total: valor,
      patch: {
        descricao: descQuitada,
        valorMulta: valor,
        dataAutuacao: dataPagamento,
        condutorId: escopoClienteId,
        veiculoId: alvo.veiculoId,
        paga: true,
        pagaEm: pagaEmIso,
        rastreameDataIso: pagaEmIso,
        situacao: "Registrado",
        categoria: alvo.categoria,
        rastreameMotoristaKey: alvo.rastreameMotoristaKey,
        rastreameRastreavelKey: alvo.rastreameRastreavelKey,
        rastreameTipo: alvo.rastreameTipo ?? "OUTROS",
      },
      comprovanteRastreame: input.comprovante ?? null,
      origemExterna: input.origemExterna,
    });
    const prox = previewProximaParcela(alvo, descricaoAntes, valorDevido, escopoClienteId);
    if (prox) {
      prox.num = 3;
      linhas.push(prox);
    }
  } else {
    const descQuitada = stripAtrasadoSemanal(descricaoAntes);
    const patch: ClienteDespesaPatch = {
      condutorId: escopoClienteId,
      veiculoId: escopoVeiculoId,
      paga: true,
      pagaEm: pagaEmIso,
      situacao: "Registrado",
    };
    if (tipoBaixa === "integral_desconto") {
      patch.valorMulta = valor;
    }
    linhas.push({
      num: 1,
      operacao: "atualizar",
      autoInfracao: alvo.autoInfracao,
      despesaId: alvo.id,
      clienteId: escopoClienteId,
      veiculoId: escopoVeiculoId,
      data: dataBrComHora(dataBr, horaBr),
      descricao: descQuitada,
      tipo,
      total: valor,
      patch,
      comprovanteRastreame: input.comprovante ?? null,
      origemExterna: input.origemExterna,
    });

    const prox = previewProximaParcela(alvo, descricaoAntes, valorDevido, escopoClienteId);
    if (prox) {
      prox.num = 2;
      linhas.push(prox);
    }
  }

  const idempotencia = verificarIdempotenciaBaixa(
    {
      clienteId: cliente.id!,
      valor,
      dataBr,
      horaBr,
      origemExterna: input.origemExterna,
      despesaId: alvo.id,
      descricaoQuitada: stripAtrasadoSemanal(descricaoAntes),
    },
    clienteDespesasList(),
  );
  if (idempotencia.status !== "ok") {
    avisos.push(`Idempotência (${idempotencia.status}): ${idempotencia.motivo}`);
  }

  let calculoSemanalAtraso: CalculoSemanalAtrasoPlano | null = null;
  if (isLocacaoSemanalEmAberto(alvo)) {
    calculoSemanalAtraso = montarCalculoSemanalAtrasoPlano({
      clienteId: cliente.id!,
      clienteNome: cliente.nome,
      veiculoId: alvo.veiculoId,
      dataPagamentoBr: dataBr,
      valorNominal: valorDevido,
    });
    if (calculoSemanalAtraso) {
      const diffJuros =
        Math.round((calculoSemanalAtraso.totalGeral - valorDevido) * 100) / 100;
      if (diffJuros > 0.01) {
        avisos.push(
          `Valor devido com juros/multa: R$ ${calculoSemanalAtraso.totalGeral.toFixed(2)} (nominal R$ ${valorDevido.toFixed(2)}).`,
        );
      }
    } else {
      const vencs = vencimentosSemanalAbertosCliente(cliente.id!, alvo.veiculoId);
      const contrato = contratoReferenciaSemanalAtraso(alvo.veiculoId, cliente.id!);
      if (
        vencs.length > 0 &&
        deveExibirCalculoSemanalAtraso(dataBr, vencs, false) &&
        (contrato?.valorSemanal == null || contrato?.valorDiaria == null)
      ) {
        avisos.push(
          "Contrato ou valores semanal/diária não encontrados — sem tabela de juros/multa.",
        );
      }
    }
  }

  return {
    cliente: { id: cliente.id!, cpf: cliente.cpf ?? null },
    pagamento: { valor, dataBr, horaBr, pagaEmIso },
    despesaAlvo: {
      autoInfracao: alvo.autoInfracao,
      descricaoAtual: alvo.descricao,
      valorDevido,
      dataVencimento: vencimento,
      veiculoId: alvo.veiculoId,
      diasDoVencimento: deltaVenc,
    },
    tipoBaixa,
    linhas,
    avisos,
    revisaoManual: input.revisaoManual || idempotencia.status !== "ok",
    idempotencia,
    calculoSemanalAtraso,
  };
}

function isBaixaPlanoUnitario(scope: CobrancasScopedContextInput): boolean {
  return (
    isEntityUuid(scope.despesaId?.trim()) &&
    isEntityUuid(scope.clienteId?.trim()) &&
    (isEntityUuid(scope.veiculoId?.trim()) || Boolean(scope.placa?.trim()))
  );
}

function enrichBaixaPlanoScope(scope: CobrancasScopedContextInput): CobrancasScopedContextInput {
  const unitario = isBaixaPlanoUnitario(scope);
  return {
    ...scope,
    emAberto: true,
    contratoPar: true,
    despesasPorVeiculo: Boolean(scope.veiculoId?.trim() || scope.placa?.trim()),
    planoUnitario: unitario,
  };
}

export async function withBaixaPlanoDbContext<T>(
  fn: () => T | Promise<T>,
  scope?: CobrancasScopedContextInput,
  flowRoute = "POST /api/recebimentos/executar",
): Promise<T> {
  resetSqlSeq();
  logFlowStep(flowRoute, 0, "início withBaixaPlanoDbContext");
  if (scope) {
    const enriched = enrichBaixaPlanoScope(scope);
    const clienteId = enriched.clienteId?.trim();
    const despesaId = enriched.despesaId?.trim();
    if (clienteId && despesaId && isEntityUuid(clienteId)) {
      _baixaPlanoCtx = await loadPlanoBaixaCtxDireto({
        clienteId,
        despesaId,
        veiculoId: enriched.veiculoId,
        placa: enriched.placa,
        flowRoute,
      });
    } else {
      _baixaPlanoCtx = await loadBaixaPlanoDbContextAsync(enriched, flowRoute);
    }
  } else {
    _baixaPlanoCtx = await loadCobrancasDbContextAsync();
  }
  setCobrancasRuntimeCtx(_baixaPlanoCtx);
  try {
    return await fn();
  } finally {
    _baixaPlanoCtx = null;
    setCobrancasRuntimeCtx(null);
  }
}

function scopeFromLinhasBaixa(linhas: LinhaPlanoBaixa[]): CobrancasScopedContextInput {
  const despesaId = linhas.map((l) => l.despesaId?.trim()).find(Boolean);
  const veiculoId =
    linhas.map((l) => l.veiculoId?.trim()).find((id) => id && isEntityUuid(id)) ??
    linhas
      .map((l) => String(l.patch?.veiculoId ?? "").trim())
      .find((id) => isEntityUuid(id));
  const clienteId =
    linhas.map((l) => l.clienteId?.trim()).find((id) => id && isEntityUuid(id)) ??
    linhas
      .map((l) => String(l.patch?.condutorId ?? "").trim())
      .find((id) => isEntityUuid(id));
  return {
    ...(clienteId ? { clienteId } : {}),
    ...(despesaId ? { despesaId } : {}),
    ...(veiculoId ? { veiculoId } : {}),
  };
}

export function mergeBaixaExecScope(
  linhas: LinhaPlanoBaixa[],
  extra?: CobrancasScopedContextInput,
): CobrancasScopedContextInput {
  const base = scopeFromLinhasBaixa(linhas);
  if (!extra) return base;
  const norm = normalizeBaixaScopeInput(extra);
  const clienteId = norm.clienteId ?? base.clienteId;
  const veiculoId = norm.veiculoId ?? base.veiculoId;
  const despesaId = norm.despesaId ?? base.despesaId;
  return {
    ...(clienteId ? { clienteId } : {}),
    ...(veiculoId ? { veiculoId } : {}),
    ...(despesaId ? { despesaId } : {}),
    ...(norm.clienteQuery ? { clienteQuery: norm.clienteQuery } : {}),
    ...(norm.placa ? { placa: norm.placa } : {}),
  };
}

export { scopeFromLinhasBaixa };

export async function montarPlanoBaixaAsync(
  input: MontarPlanoBaixaInput,
): Promise<PlanoBaixaRecebimento> {
  const flowRoute = "POST /api/recebimentos/plano";
  resetSqlSeq();
  logFlowStep(flowRoute, 0, "início montarPlanoBaixaAsync");

  const clienteId = input.clienteId?.trim();
  const despesaId = input.despesaId?.trim();
  if (clienteId && despesaId && isEntityUuid(clienteId)) {
    _baixaPlanoCtx = await loadPlanoBaixaCtxDireto({
      clienteId,
      despesaId,
      veiculoId: input.veiculoId,
      placa: input.placa,
      flowRoute,
    });
  } else {
    _baixaPlanoCtx = await loadBaixaPlanoDbContextAsync(
      enrichBaixaPlanoScope(
        normalizeBaixaScopeInput({
          clienteId: input.clienteId,
          clienteQuery: input.clienteQuery,
          veiculoId: input.veiculoId,
          despesaId: input.despesaId,
          placa: input.placa,
        }),
      ),
      flowRoute,
    );
  }

  setCobrancasRuntimeCtx(_baixaPlanoCtx);
  try {
    logFlowStep(flowRoute, 9, "montarPlanoBaixa (memória)");
    return montarPlanoBaixa(input);
  } finally {
    _baixaPlanoCtx = null;
    setCobrancasRuntimeCtx(null);
  }
}

export function formatPlanoTabela(plano: PlanoBaixaRecebimento): string {
  const rows = plano.linhas.map(
    (l) =>
      `| ${l.veiculoId ?? "—"} | ${l.data} | ${l.descricao} | ${l.clienteId ?? plano.cliente.id} | ${l.tipo} | R$ ${l.total.toFixed(2)} |`,
  );
  const total = plano.linhas.reduce((s, l) => s + l.total, 0);
  return [
    "| veiculoId | Data | Descrição | clienteId | Tipo | Total |",
    "|---|---|---|---|---|---|",
    ...rows,
    `| **Total** | | | | | **R$ ${total.toFixed(2)}** |`,
  ].join("\n");
}
