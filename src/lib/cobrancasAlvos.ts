/**
 * Alvos elegíveis por tipo de cobrança (somente despesas em aberto + frota ativa).
 */
import {
  isCategoriaManutencao,
  isClienteDespesaAtiva,
  inferirCondutorIdDespesaPorData,
  isInfracaoSemDataAutuacao,
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { loadClientesDb } from "./clientesDb.js";
import type { CobrancasDbContext } from "./cobrancasDbContext.js";
import { compararDataBrAsc } from "./contratoExtrair.js";
import { parseDataAutuacao, inferirCondutorInfracao } from "./inferirCondutorInfracao.js";
import {
  contratoAtivoOperacional,
  contratoMaisRecentePar,
  loadContratosDb,
  type ContratoRegistro,
} from "./contratosDb.js";
import { infracaoIncluirListagemRelatorio } from "./infracaoTitulo.js";
import { despesaCobravelLocatario } from "./espelharSemLocatarioParceiro.js";
import {
  dataVencimentoSemanalBr,
  isJurosMultaSemanalDescricao,
  vencimentoDespesaSemanalBr,
} from "./pagamentoSemanal.js";
import { vencimentoSemanalElegivelCobranca } from "./pagamentoSemanalCobranca.js";
import { isCategoriaEstacionamento } from "./estacionamentoCategoria.js";
import { isCategoriaPedagio } from "./pedagioCategoria.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { loadVeiculosDb } from "./veiculosDb.js";

export type TipoCobrancaAction =
  | "pagamento-semanal"
  | "renegociacao"
  | "infracoes"
  | "pedagio"
  | "estacionamento-rotativo"
  | "manutencao";

export const TIPOS_COBRANCA_ACTION: readonly TipoCobrancaAction[] = [
  "pagamento-semanal",
  "renegociacao",
  "infracoes",
  "pedagio",
  "estacionamento-rotativo",
  "manutencao",
] as const;

export const ROTULO_TIPO_COBRANCA: Record<TipoCobrancaAction, string> = {
  "pagamento-semanal": "Pagamento semanal",
  renegociacao: "Renegociação",
  infracoes: "Infrações",
  pedagio: "Pedágio Digital",
  "estacionamento-rotativo": "Estacionamento rotativo",
  manutencao: "Manutenção",
};

export type ModoCanvasCobranca = "completo" | "simples-tipo" | "simples-placa";

/** Canvas completo (por contrato) vs simplificado (agrupado por tipo ou por placa). */
export function resolverModoCanvasCobranca(
  tipos: TipoCobrancaAction[],
  filtro: FiltroAlvosCobranca,
): ModoCanvasCobranca {
  if (filtro.placa && !filtro.clienteId) return "simples-placa";
  if (filtro.clienteId) return "completo";
  const todosTipos = tipos.length === TIPOS_COBRANCA_ACTION.length;
  if (!todosTipos && tipos.length === 1) return "simples-tipo";
  return "completo";
}

export type AlvoCobranca = {
  tipo: TipoCobrancaAction;
  placa: string;
  clienteId: string | null;
  clienteNome: string | null;
  /** Despesas em aberto que fundamentam a cobrança. */
  despesas: ClienteDespesaRegistro[];
  /** Vencimentos semanais (pagamento-semanal). */
  vencimentosBr?: string[];
};

function veiculosAtivos(ctx?: CobrancasDbContext) {
  const map = new Map<string, ReturnType<typeof loadVeiculosDb>["veiculos"][0]>();
  const lista = ctx?.veiculos ?? loadVeiculosDb().veiculos;
  for (const v of lista) {
    if (v.ativo === false) continue;
    if (v.particular === true) continue;
    map.set(compactPlaca(v.placa), v);
  }
  return map;
}

function clientesAtivos(ctx?: CobrancasDbContext) {
  const map = new Map<string, { id: string; nome: string }>();
  const lista = ctx?.clientes ?? loadClientesDb().clientes;
  for (const c of lista) {
    if (c.ativo === false) continue;
    if (c.id) map.set(c.id, { id: c.id, nome: c.nome });
  }
  return map;
}

function despesaAberta(d: ClienteDespesaRegistro): boolean {
  return (
    isClienteDespesaAtiva(d) &&
    d.paga !== true &&
    (d.situacao === "Em aberto" || !d.paga)
  );
}

export function despesaNaSituacao(
  d: ClienteDespesaRegistro,
  situacao: SituacaoCobrancaFiltro = "em_aberto",
): boolean {
  if (situacao === "todos") {
    return d.ativo !== false;
  }
  if (!isClienteDespesaAtiva(d)) return false;
  if (situacao === "pago") return d.paga === true;
  return despesaAberta(d);
}

function placaElegivel(placa: string, veiculos: ReturnType<typeof veiculosAtivos>): boolean {
  return veiculos.has(compactPlaca(placa));
}

function clienteElegivel(
  clienteId: string | null | undefined,
  clientes: ReturnType<typeof clientesAtivos>,
): boolean {
  if (!clienteId) return true;
  return clientes.has(clienteId);
}

function contratosLista(ctx?: CobrancasDbContext): ContratoRegistro[] {
  return ctx?.contratos ?? loadContratosDb().contratos;
}

/** Pagamento semanal só com contrato ativo locatário + veículo (encerrado → renegociação). */
function temContratoAtivoLocacao(
  clienteId: string | null | undefined,
  placa: string,
  contratos: ContratoRegistro[],
): boolean {
  if (!clienteId) return false;
  const contrato = contratoMaisRecentePar({ placa, clienteId }, contratos);
  return contrato?.status === "ativo";
}

function contratoParEncerrado(
  clienteId: string | null | undefined,
  placa: string,
  contratos: ContratoRegistro[],
): ContratoRegistro | undefined {
  if (!clienteId) return undefined;
  const contrato = contratoMaisRecentePar({ placa, clienteId }, contratos);
  return contrato?.status === "encerrado" ? contrato : undefined;
}

/** Semanal ATRASADO de ex-locatário (contrato encerrado) — cobrança via tipo renegociacao. */
function despesaRenegociacaoEncerrada(
  d: ClienteDespesaRegistro,
  contratos: ContratoRegistro[],
): boolean {
  if (d.categoria !== "Locação semanal") return false;
  if (!/ATRASADO/i.test(d.descricao ?? "")) return false;
  const placa = formatPlacaHyphen(d.veiculoId);
  const clienteId = d.condutorId ?? inferirCondutorIdDespesaPorData(d);
  if (!clienteId) return false;
  if (temContratoAtivoLocacao(clienteId, placa, contratos)) return false;
  return Boolean(contratoParEncerrado(clienteId, placa, contratos));
}

function clienteTemPendenciaEncerrada(
  clienteId: string,
  despesas: ClienteDespesaRegistro[],
  contratos: ContratoRegistro[],
  situacao: SituacaoCobrancaFiltro = "em_aberto",
): boolean {
  for (const c of contratos) {
    if (c.clienteId !== clienteId || c.status !== "encerrado" || !c.placa) continue;
    if (temContratoAtivoLocacao(clienteId, c.placa, contratos)) continue;
    for (const d of despesas) {
      if (!despesaNaSituacao(d, situacao)) continue;
      if (!despesaCobravelLocatario(d)) continue;
      if (compactPlaca(d.veiculoId) !== compactPlaca(c.placa)) continue;
      if (d.condutorId === clienteId) return true;
      if (despesaRenegociacaoEncerrada(d, contratos)) return true;
      const inferido = inferirCondutorIdDespesaPorData(d);
      if (inferido === clienteId) return true;
    }
  }
  return false;
}

function contratoAtivoPorPlaca(
  placa: string,
  contratos: ContratoRegistro[],
): ContratoRegistro | undefined {
  const p = compactPlaca(placa);
  const list = contratos.filter(
    (c) => c.status === "ativo" && compactPlaca(c.placa) === p,
  );
  if (list.length === 0) return undefined;
  return list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0))[0];
}

/**
 * Despesa ATRASADO pode ter condutorId antigo (ex.: troca de locatário).
 * Usa o contrato ativo da placa quando o condutor da linha não tem contrato vigente.
 * Nome de exibição vem do contrato (ex.: Laryssa no cadastro, não Gustavo do Rastreame).
 */
function condutorEfetivoPagamentoSemanal(
  d: ClienteDespesaRegistro,
  placa: string,
  clientes: ReturnType<typeof clientesAtivos>,
  contratos: ContratoRegistro[],
): { clienteId: string | null; clienteNome: string | null } {
  const placaFmt = formatPlacaHyphen(placa);

  if (d.condutorId) {
    const contratoCondutor = contratoMaisRecentePar(
      {
        placa: placaFmt,
        clienteId: d.condutorId,
      },
      contratos,
    );
    if (contratoCondutor?.status === "ativo") {
      const cliente = clientes.get(d.condutorId);
      return {
        clienteId: d.condutorId,
        clienteNome: contratoCondutor.clienteNome ?? cliente?.nome ?? null,
      };
    }
    // Ex-locatário desta placa — semanal vira renegociação.
    if (contratoCondutor?.status === "encerrado") {
      return { clienteId: null, clienteNome: null };
    }
    // Condutor na linha não é locatário deste veículo — não reatribuir ao atual.
    return { clienteId: null, clienteNome: null };
  }

  const vigente = contratoAtivoPorPlaca(placaFmt, contratos);
  if (vigente?.clienteId) {
    return {
      clienteId: vigente.clienteId,
      clienteNome: vigente.clienteNome,
    };
  }

  const cliente = d.condutorId ? clientes.get(d.condutorId) : null;
  return { clienteId: d.condutorId ?? null, clienteNome: cliente?.nome ?? null };
}

/**
 * ATRASADO duplicado já quitado por pagamento regular integral do mesmo vencimento.
 * Pagamento parcial (ex.: R$ 400 + saldo ATRASADO R$ 250) não torna a linha obsoleta.
 */
function semanalAtrasoObsoleto(
  d: ClienteDespesaRegistro,
  todas: ClienteDespesaRegistro[],
  clienteId: string,
  placa: string,
  valorSemanal: number | null | undefined,
): boolean {
  if (isJurosMultaSemanalDescricao(d.descricao ?? "")) return false;

  const vencAtraso = vencimentoDespesaSemanalBr(
    d.descricao ?? "",
    d.rastreameDataIso,
    d.dataAutuacao,
  );
  if (!vencAtraso) return false;
  if (valorSemanal == null || valorSemanal <= 0) return false;

  const placaKey = compactPlaca(placa);
  let totalPagoRegular = 0;

  for (const other of todas) {
    if (other.categoria !== "Locação semanal") continue;
    if (compactPlaca(other.veiculoId) !== placaKey) continue;
    if (other.condutorId !== clienteId) continue;
    if (other.paga !== true) continue;

    const desc = other.descricao ?? "";
    if (/ATRASADO/i.test(desc)) continue;
    if (/\[NEGOCIADO/i.test(desc)) continue;

    const vencOther = vencimentoDespesaSemanalBr(
      other.descricao ?? "",
      other.rastreameDataIso,
      other.dataAutuacao,
    );
    if (vencOther !== vencAtraso) continue;

    totalPagoRegular += Number(other.valorMulta) || 0;
  }

  return totalPagoRegular >= valorSemanal;
}

/** Condutor responsável pela infração na data da autuação (não o locatário atual da placa). */
function condutorEfetivoInfracao(
  d: ClienteDespesaRegistro,
  clientes: ReturnType<typeof clientesAtivos>,
): { clienteId: string | null; clienteNome: string | null } {
  if (d.condutorId) {
    const cliente = clientes.get(d.condutorId);
    return { clienteId: d.condutorId, clienteNome: cliente?.nome ?? null };
  }
  if (isInfracaoSemDataAutuacao(d)) {
    return { clienteId: null, clienteNome: null };
  }
  const sug = inferirCondutorInfracao(
    formatPlacaHyphen(d.veiculoId),
    d.dataAutuacao,
    90,
  );
  if (sug.condutorId) {
    const cliente = clientes.get(sug.condutorId);
    return {
      clienteId: sug.condutorId,
      clienteNome: sug.clienteNome ?? cliente?.nome ?? null,
    };
  }
  return { clienteId: null, clienteNome: null };
}

function agruparInfracoesPorCondutor(
  despesas: ClienteDespesaRegistro[],
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
): AlvoCobranca[] {
  const porChave = new Map<string, AlvoCobranca>();

  for (const d of despesas) {
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    if (!despesaCobravelLocatario(d)) continue;
    const placa = formatPlacaHyphen(d.veiculoId);
    const efetivo = condutorEfetivoInfracao(d, clientes);
    if (efetivo.clienteId && !clienteElegivel(efetivo.clienteId, clientes)) continue;

    const chave = `${compactPlaca(placa)}|${efetivo.clienteId ?? ""}`;
    let alvo = porChave.get(chave);
    if (!alvo) {
      alvo = {
        tipo: "infracoes",
        placa,
        clienteId: efetivo.clienteId,
        clienteNome: efetivo.clienteNome,
        despesas: [],
      };
      porChave.set(chave, alvo);
    }
    alvo.despesas.push(d);
  }

  return [...porChave.values()].sort((a, b) => a.placa.localeCompare(b.placa));
}

/** Locatário efetivo para pedágio, estacionamento, renegociação etc. (data do evento quando aplicável). */
function condutorEfetivoDespesa(
  d: ClienteDespesaRegistro,
  clientes: ReturnType<typeof clientesAtivos>,
): { clienteId: string | null; clienteNome: string | null } {
  const clienteId = inferirCondutorIdDespesaPorData(d);
  if (clienteId) {
    const cliente = clientes.get(clienteId);
    return { clienteId, clienteNome: cliente?.nome ?? null };
  }
  return { clienteId: null, clienteNome: null };
}

function agruparPorPlaca(
  tipo: TipoCobrancaAction,
  despesas: ClienteDespesaRegistro[],
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
): AlvoCobranca[] {
  const porChave = new Map<string, AlvoCobranca>();
  for (const d of despesas) {
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    if (!despesaCobravelLocatario(d)) continue;
    const placa = formatPlacaHyphen(d.veiculoId);
    const efetivo = condutorEfetivoDespesa(d, clientes);
    if (efetivo.clienteId && !clienteElegivel(efetivo.clienteId, clientes)) continue;

    const chave = `${compactPlaca(placa)}|${efetivo.clienteId ?? ""}`;
    let alvo = porChave.get(chave);
    if (!alvo) {
      alvo = {
        tipo,
        placa,
        clienteId: efetivo.clienteId,
        clienteNome: efetivo.clienteNome,
        despesas: [],
      };
      porChave.set(chave, alvo);
    }
    alvo.despesas.push(d);
  }

  return [...porChave.values()].sort((a, b) => a.placa.localeCompare(b.placa));
}

function hojeBr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function filtrarPagamentoSemanal(
  db: ReturnType<typeof loadClienteDespesasDb>,
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
  contratos: ContratoRegistro[],
  filtro?: FiltroAlvosCobranca,
): AlvoCobranca[] {
  const alvoPlaca = filtro?.placa ? compactPlaca(filtro.placa) : null;
  const porChave = new Map<string, AlvoCobranca>();
  const dataReferencia = hojeBr();
  const situacao = filtro?.situacao ?? "em_aberto";

  for (const d of db.clienteDespesas) {
    if (!despesaNaSituacao(d, situacao)) continue;
    if (!despesaNoPeriodo(d, filtro ?? {})) continue;
    if (d.categoria !== "Locação semanal") continue;
    if (situacao === "em_aberto") {
      if (!/ATRASADO/i.test(d.descricao)) continue;
      const vencSemanal = vencimentoDespesaSemanalBr(
        d.descricao ?? "",
        d.rastreameDataIso,
        d.dataAutuacao,
      );
      if (
        vencSemanal &&
        !vencimentoSemanalElegivelCobranca(vencSemanal, dataReferencia)
      ) {
        continue;
      }
    }
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    if (!clienteElegivel(d.condutorId, clientes)) continue;
    if (alvoPlaca && compactPlaca(d.veiculoId) !== alvoPlaca) continue;

    const placa = formatPlacaHyphen(d.veiculoId);
    const efetivo = condutorEfetivoPagamentoSemanal(d, placa, clientes, contratos);
    if (!efetivo.clienteId || !temContratoAtivoLocacao(efetivo.clienteId, placa, contratos)) {
      continue;
    }
    const contrato = contratoMaisRecentePar(
      {
        placa,
        clienteId: efetivo.clienteId,
      },
      contratos,
    );
    if (
      situacao === "em_aberto" &&
      semanalAtrasoObsoleto(
        d,
        db.clienteDespesas,
        efetivo.clienteId,
        placa,
        contrato?.valorSemanal,
      )
    ) {
      continue;
    }

    const chave = `${efetivo.clienteId}|${compactPlaca(placa)}`;
    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );

    let alvo = porChave.get(chave);
    if (!alvo) {
      alvo = {
        tipo: "pagamento-semanal",
        placa,
        clienteId: efetivo.clienteId,
        clienteNome: efetivo.clienteNome,
        despesas: [],
        vencimentosBr: [],
      };
      porChave.set(chave, alvo);
    }
    alvo.despesas.push(d);
    if (venc && !alvo.vencimentosBr!.includes(venc)) {
      alvo.vencimentosBr!.push(venc);
    }
  }

  return [...porChave.values()]
    .filter((a) => (a.despesas?.length ?? 0) > 0 && (a.vencimentosBr?.length ?? 0) > 0)
    .map((a) => ({
      ...a,
      vencimentosBr: [...(a.vencimentosBr ?? [])].sort(compararDataBrAsc),
    }))
    .sort((a, b) => a.placa.localeCompare(b.placa));
}

export type SituacaoCobrancaFiltro = "em_aberto" | "pago" | "todos";

export type FiltroAlvosCobranca = {
  /** Limita a uma placa. */
  placa?: string;
  /** Limita a um cliente (nome, CPF ou id — resolvido em clientes.json). */
  clienteId?: string;
  /** Período inclusivo (DD/MM/AAAA) sobre a data da despesa (`dataAutuacao` / `pagaEm`). */
  dataInicial?: string;
  dataFinal?: string;
  /** Situação de pagamento da despesa (padrão: em_aberto). */
  situacao?: SituacaoCobrancaFiltro;
  /** Inclui ex-locatários com contrato encerrado e débitos em aberto (padrão: true). */
  incluirEncerradosComPendencia?: boolean;
};

function parseDataBrDia(s: string): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function dataDespesaParaFiltro(d: ClienteDespesaRegistro): Date | null {
  return parseDataAutuacao(d.dataAutuacao) ?? parseDataBrDia(d.pagaEm ?? "");
}

export function despesaNoPeriodo(
  d: ClienteDespesaRegistro,
  filtro: Pick<FiltroAlvosCobranca, "dataInicial" | "dataFinal"> = {},
): boolean {
  if (!filtro.dataInicial?.trim() && !filtro.dataFinal?.trim()) return true;
  const dt = dataDespesaParaFiltro(d);
  if (!dt) return false;
  const ini = filtro.dataInicial?.trim() ? parseDataBrDia(filtro.dataInicial) : null;
  const fim = filtro.dataFinal?.trim() ? parseDataBrDia(filtro.dataFinal) : null;
  if (ini && dt < ini) return false;
  if (fim) {
    const fimFim = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999);
    if (dt > fimFim) return false;
  }
  return true;
}

/**
 * Contratos ativos de locação elegíveis para relatório/canvas (1 por placa).
 * Exige veículo ativo (não particular) e cliente ativo.
 * Vários `ativo` na mesma placa: maior versão; empate → data de início mais recente.
 */
export function listarEscoposContratosAtivosCobranca(
  ctx?: CobrancasDbContext,
): FiltroAlvosCobranca[] {
  const veiculos = veiculosAtivos(ctx);
  const clientes = clientesAtivos(ctx);
  const porPlaca = new Map<string, ContratoRegistro>();
  const contratos = ctx?.contratos ?? loadContratosDb().contratos;

  for (const c of contratos) {
    if (!contratoAtivoOperacional(c) || !c.placa || !c.clienteId) continue;
    if (!placaElegivel(c.placa, veiculos)) continue;
    if (!clienteElegivel(c.clienteId, clientes)) continue;

    const p = compactPlaca(c.placa);
    const cur = porPlaca.get(p);
    if (!cur) {
      porPlaca.set(p, c);
      continue;
    }
    const byVersao = (c.versao ?? 0) - (cur.versao ?? 0);
    if (byVersao > 0) {
      porPlaca.set(p, c);
    } else if (byVersao === 0) {
      if (compararDataBrAsc(cur.dataInicio ?? "", c.dataInicio ?? "") < 0) {
        porPlaca.set(p, c);
      }
    }
  }

  const escopos: FiltroAlvosCobranca[] = [];
  for (const c of porPlaca.values()) {
    escopos.push({
      clienteId: c.clienteId!,
      placa: formatPlacaHyphen(c.placa),
    });
  }

  return escopos.sort((a, b) =>
    compactPlaca(a.placa ?? "").localeCompare(compactPlaca(b.placa ?? "")),
  );
}

/**
 * Clientes com contrato encerrado e débitos em aberto (ex-locatários devendo).
 * Um escopo por cliente — agrupa todas as placas no relatório completo.
 */
export function listarEscoposContratosEncerradosComPendencia(
  ctx?: CobrancasDbContext,
  filtro?: Pick<FiltroAlvosCobranca, "situacao" | "dataInicial" | "dataFinal" | "incluirEncerradosComPendencia">,
): FiltroAlvosCobranca[] {
  if (filtro?.incluirEncerradosComPendencia === false) return [];

  const clientes = clientesAtivos(ctx);
  const contratos = contratosLista(ctx);
  const db = ctx
    ? { clienteDespesas: ctx.clienteDespesas }
    : loadClienteDespesasDb();
  const situacao = filtro?.situacao ?? "em_aberto";
  const clienteIds = new Set<string>();

  for (const c of clientes.values()) {
    if (clienteTemPendenciaEncerrada(c.id, db.clienteDespesas, contratos, situacao)) {
      clienteIds.add(c.id);
    }
  }

  const extras = {
    ...(filtro?.dataInicial ? { dataInicial: filtro.dataInicial } : {}),
    ...(filtro?.dataFinal ? { dataFinal: filtro.dataFinal } : {}),
    situacao,
    incluirEncerradosComPendencia: true as const,
  };

  return [...clienteIds]
    .map((clienteId) => ({ clienteId, ...extras }))
    .sort((a, b) =>
      (clientes.get(a.clienteId!)?.nome ?? a.clienteId!).localeCompare(
        clientes.get(b.clienteId!)?.nome ?? b.clienteId!,
        "pt-BR",
      ),
    );
}

function filtrarAlvosPorEscopo(
  alvos: AlvoCobranca[],
  filtro?: FiltroAlvosCobranca,
): AlvoCobranca[] {
  if (!filtro?.placa && !filtro?.clienteId) return alvos;
  return alvos.filter((a) => {
    if (filtro.placa && compactPlaca(a.placa) !== compactPlaca(filtro.placa)) {
      return false;
    }
    if (filtro.clienteId && a.clienteId !== filtro.clienteId) {
      return false;
    }
    return true;
  });
}

export function normalizarTipoCobrancaAction(raw: string): TipoCobrancaAction | null {
  const t = raw.trim().toLowerCase();
  const map: Record<string, TipoCobrancaAction> = {
    "pagamento-semanal": "pagamento-semanal",
    pagamento_semanal: "pagamento-semanal",
    renegociacao: "renegociacao",
    renegociação: "renegociacao",
    infracoes: "infracoes",
    infrações: "infracoes",
    pedagio: "pedagio",
    pedágio: "pedagio",
    "estacionamento-rotativo": "estacionamento-rotativo",
    manutencao: "manutencao",
    manutenção: "manutencao",
  };
  return map[t] ?? null;
}

/** Lista alvos elegíveis para um tipo de cobrança. Sem alvos = array vazio. */
export function listarAlvosCobranca(
  tipo: TipoCobrancaAction,
  filtro?: FiltroAlvosCobranca,
  ctx?: CobrancasDbContext,
): AlvoCobranca[] {
  const db = ctx
    ? { clienteDespesas: ctx.clienteDespesas }
    : loadClienteDespesasDb();
  const veiculos = veiculosAtivos(ctx);
  const clientes = clientesAtivos(ctx);
  const contratos = contratosLista(ctx);
  const placaFiltro = filtro?.placa;
  const situacao = filtro?.situacao ?? "em_aberto";
  const incluirEncerrados = filtro?.incluirEncerradosComPendencia !== false;

  let alvos: AlvoCobranca[];

  if (tipo === "pagamento-semanal") {
    alvos = filtrarPagamentoSemanal(db, veiculos, clientes, contratos, filtro);
  } else {
    const categoriaMap: Record<
      Exclude<TipoCobrancaAction, "pagamento-semanal" | "infracoes">,
      string
    > = {
      renegociacao: "Renegociação",
      pedagio: "Pedágio",
      "estacionamento-rotativo": "Estacionamento",
      manutencao: "Manutenção",
    };

    if (tipo === "infracoes") {
      const despesas = db.clienteDespesas.filter((d) => {
        if (!infracaoIncluirListagemRelatorio(d)) return false;
        if (!despesaCobravelLocatario(d)) return false;
        if (!despesaNaSituacao(d, situacao)) return false;
        if (!despesaNoPeriodo(d, filtro ?? {})) return false;
        if (placaFiltro && compactPlaca(d.veiculoId) !== compactPlaca(placaFiltro)) {
          return false;
        }
        return true;
      });
      alvos = agruparInfracoesPorCondutor(despesas, veiculos, clientes);
    } else {
      const categoria =
        categoriaMap[tipo as Exclude<TipoCobrancaAction, "pagamento-semanal" | "infracoes">];
      const despesas = db.clienteDespesas.filter((d) => {
        if (!despesaNaSituacao(d, situacao)) return false;
        if (!despesaCobravelLocatario(d)) return false;
        if (!despesaNoPeriodo(d, filtro ?? {})) return false;
        if (tipo === "manutencao" && !isCategoriaManutencao(d.categoria)) return false;
        if (tipo === "pedagio" && !isCategoriaPedagio(d.categoria)) return false;
        if (tipo === "estacionamento-rotativo" && !isCategoriaEstacionamento(d.categoria)) {
          return false;
        }
        if (tipo === "renegociacao") {
          const cat = (d.categoria ?? "").trim();
          if (cat === categoriaMap.renegociacao) {
            // ok
          } else if (incluirEncerrados && despesaRenegociacaoEncerrada(d, contratos)) {
            // semanal ATRASADO de contrato encerrado
          } else {
            return false;
          }
        } else if (
          tipo !== "manutencao" &&
          tipo !== "pedagio" &&
          tipo !== "estacionamento-rotativo" &&
          (d.categoria ?? "") !== categoria
        ) {
          return false;
        }
        if (tipo === "manutencao" && d.valorMulta <= 0) return false;
        if (placaFiltro && compactPlaca(d.veiculoId) !== compactPlaca(placaFiltro)) {
          return false;
        }
        return true;
      });
      alvos = agruparPorPlaca(tipo, despesas, veiculos, clientes);
    }
  }

  return filtrarAlvosPorEscopo(alvos, filtro);
}
