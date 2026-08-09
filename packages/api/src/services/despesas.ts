import crypto from "node:crypto";

import {
  queryClienteDespesasFromSql,
  queryContratosFromSql,
  resolveVeiculoIdFromSql,
  useRelationalStore,
  warmupPgPool,
} from "@lanza/db";
import {
  confirmarCondutorClienteDespesa,
  confirmarDebitoParceiroDespesa,
  despesaResponsavelConfirmado,
  despesaAtribuidaACliente,
  editarClienteDespesa,
  excluirClienteDespesa,
  findClienteDespesaById,
  findClienteDespesaByIdAsync,
  gravarClienteDespesa,
  isClienteDespesaAtiva,
  isClienteDespesaEmAberto,
  isClienteDespesaPaga,
  isClienteDespesaBaixada,
  loadClienteDespesasDb,
  loadClienteDespesasDbAsync,
  loadClientesDb,
  loadClientesDbAsync,
  loadContratosDbAsync,
  loadVeiculosDbAsync,
  findVeiculoById,
  formatVeiculoLabel,
  vencimentoClienteDespesaBr,
  type ClienteDespesaInput,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
  type ClienteRegistro,
  type ContratoRegistro,
  type VeiculoRegistro,
  reconciliarCondutores,
  dataStringNoPeriodo,
  isCategoriaPedagio,
  isCategoriaEstacionamento,
  resolveVeiculoIdListagem,
  loadCatalogoEnriquecimentoDespesas,
  resolveSyncRastreame,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import {
  CATEGORIAS_DESPESA_VENDA,
  autoInfracaoPrefixoVenda,
  isCategoriaVenda,
} from "../../../../src/lib/domain/categoriaDespesaVenda.js";

export type ListarDespesasOpts = {
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
  competencia?: string;
  emAberto?: boolean;
  /** Filtro canónico: em_aberto | pago | baixado. */
  statusCobranca?: "em_aberto" | "pago" | "baixado";
  /** @deprecated legado — registros com ativo=false eram soft delete; exclusão agora remove a linha */
  ativo?: boolean;
  semCliente?: boolean;
  /** @deprecated use semCliente */
  semCondutor?: boolean;
  dataInicial?: string;
  dataFinal?: string;
  /** true = só despesas de venda; false = exclui venda; omitido = todas */
  moduloVenda?: boolean;
  /** Filtra parcelas/entrada de uma venda (auto_infracao VENDA-{id}-*). */
  vendaId?: string;
};

export type SyncOpts = {
  syncRastreame?: boolean;
  /** Plano de baixa já lista a próxima semana — não criar automaticamente. */
  skipProximaParcela?: boolean;
  /** UUID do veículo (evita resolver por placa). */
  veiculoId?: string;
};

type DespesasCatalogo = {
  despesas: ClienteDespesaRegistro[];
  clientes: ClienteRegistro[];
  veiculos: VeiculoRegistro[];
  contratos: ContratoRegistro[];
};

function despesaEmAberto(d: ClienteDespesaRegistro): boolean {
  return isClienteDespesaEmAberto(d);
}


function competenciaDeDespesa(d: ClienteDespesaRegistro): string | null {
  for (const raw of [d.dataAutuacao, d.pagaEm]) {
    const data = String(raw ?? "").trim();
    const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[2]}/${m[3]}`;
  }
  return null;
}

export type DespesaClienteListagem = ClienteDespesaRegistro & {
  placa: string;
  veiculoLabel: string;
  /** Alias de condutorId para o frontend. */
  clienteId: string | null;
  clienteNome: string | null;
  vencimentoBr: string | null;
  pagaEmBr: string | null;
};

function pagaEmDespesaBr(d: ClienteDespesaRegistro): string | null {
  const raw = String(d.pagaEm ?? "").trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/);
  if (br) return br[1]!;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function veiculoDaDespesaCliente(d: ClienteDespesaRegistro, veiculos: VeiculoRegistro[]) {
  const id = String(d.veiculoId ?? "").trim();
  if (!id) return undefined;
  return veiculos.find((v) => v.id === id) ?? findVeiculoById(id);
}

function clienteNomeDespesa(d: ClienteDespesaRegistro, clientes: ClienteRegistro[]): string | null {
  const id = d.condutorId?.trim();
  if (!id) return null;
  const nome = clientes.find((c) => c.id === id)?.nome?.trim();
  return nome || null;
}

function vencimentoSortMs(vencimentoBr: string | null | undefined): number {
  const m = String(vencimentoBr ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  const [, dd, mm, yyyy] = m;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
}

function ordenarDespesasPorVencimentoDesc(items: DespesaClienteListagem[]): DespesaClienteListagem[] {
  return [...items].sort((a, b) => {
    const ta = vencimentoSortMs(a.vencimentoBr);
    const tb = vencimentoSortMs(b.vencimentoBr);
    if (ta !== tb) return tb - ta;
    return (b.id ?? "").localeCompare(a.id ?? "");
  });
}

function enriquecerDespesaCliente(
  d: ClienteDespesaRegistro,
  catalogo: DespesasCatalogo,
): DespesaClienteListagem {
  const veiculo = veiculoDaDespesaCliente(d, catalogo.veiculos);
  const placa = veiculo?.placa ?? null;
  return {
    ...d,
    placa,
    veiculoLabel: formatVeiculoLabel(
      veiculo ?? {
        placa,
        marcaModelo: null,
        anoModelo: null,
      },
    ),
    clienteId: d.condutorId ?? null,
    clienteNome: clienteNomeDespesa(d, catalogo.clientes),
    vencimentoBr: vencimentoClienteDespesaBr(d),
    pagaEmBr: pagaEmDespesaBr(d),
  };
}

function filtrarDespesas(items: ClienteDespesaRegistro[], opts: ListarDespesasOpts, catalogo: DespesasCatalogo) {
  const veiculoIdFiltro = resolveVeiculoIdListagem(
    { veiculoId: opts.veiculoId, placa: opts.placa },
    catalogo.veiculos,
  );

  if (veiculoIdFiltro) {
    items = items.filter((d) => d.veiculoId === veiculoIdFiltro);
  }

  if (opts.categoria?.trim()) {
    const cat = opts.categoria.trim();
    if (isCategoriaPedagio(cat)) {
      items = items.filter((d) => isCategoriaPedagio(d.categoria));
    } else if (isCategoriaEstacionamento(cat)) {
      items = items.filter((d) => isCategoriaEstacionamento(d.categoria));
    } else {
      items = items.filter((d) => (d.categoria ?? "").trim().toLowerCase() === cat.toLowerCase());
    }
  }

  if (opts.moduloVenda === true) {
    items = items.filter((d) => isCategoriaVenda(d.categoria));
  } else if (opts.moduloVenda === false) {
    items = items.filter((d) => !isCategoriaVenda(d.categoria));
  }

  if (opts.vendaId?.trim()) {
    const prefix = `${autoInfracaoPrefixoVenda(opts.vendaId.trim())}-`.toUpperCase();
    items = items.filter((d) => String(d.autoInfracao ?? "").toUpperCase().startsWith(prefix));
  }

  if (opts.competencia?.trim()) {
    const comp = opts.competencia.trim();
    items = items.filter((d) => competenciaDeDespesa(d) === comp);
  }

  if (opts.ativo === true) {
    items = items.filter(isClienteDespesaAtiva);
  } else if (opts.ativo === false) {
    items = items.filter((d) => !isClienteDespesaAtiva(d));
  }

  if (opts.statusCobranca === "em_aberto") {
    items = items.filter(despesaEmAberto);
  } else if (opts.statusCobranca === "pago") {
    items = items.filter(isClienteDespesaPaga);
  } else if (opts.statusCobranca === "baixado") {
    items = items.filter(isClienteDespesaBaixada);
  } else if (opts.emAberto === true) {
    items = items.filter(despesaEmAberto);
  } else if (opts.emAberto === false) {
    items = items.filter((d) => !despesaEmAberto(d));
  }

  if (opts.clienteId?.trim()) {
    const clienteId = opts.clienteId.trim();
    items = items.filter((d) => {
      const condutorId = String(d.condutorId ?? "").trim();
      if (condutorId === clienteId) return true;
      const veiculo = veiculoDaDespesaCliente(d, catalogo.veiculos);
      if (veiculo?.clienteVinculadoId === clienteId) return true;
      if (condutorId && condutorId !== clienteId) return false;
      return despesaAtribuidaACliente(d, clienteId, 90, {
        contratos: catalogo.contratos,
        veiculos: catalogo.veiculos,
      });
    });
  }

  const semCliente = opts.semCliente === true || opts.semCondutor === true;
  if (semCliente) {
    items = items.filter((d) => !despesaResponsavelConfirmado(d));
  }

  if (opts.dataInicial?.trim() || opts.dataFinal?.trim()) {
    items = items.filter((d) =>
      dataStringNoPeriodo(vencimentoClienteDespesaBr(d), {
        dataInicial: opts.dataInicial,
        dataFinal: opts.dataFinal,
      }),
    );
  }

  return items;
}

async function loadDespesasCatalogo(opts: ListarDespesasOpts = {}): Promise<DespesasCatalogo> {
  const clienteId = opts.clienteId?.trim();
  if (await useRelationalStore()) {
    await warmupPgPool();
    const veiculoId =
      opts.veiculoId?.trim() ||
      (opts.placa?.trim() ? (await resolveVeiculoIdFromSql({ placa: opts.placa })) ?? undefined : undefined);
    const despesas = (await queryClienteDespesasFromSql({
      clienteId,
      veiculoId,
      emAberto: opts.statusCobranca ? undefined : opts.emAberto,
      statusCobranca: opts.statusCobranca,
      ativo: opts.ativo,
      categoria: opts.categoria,
      moduloVenda: opts.moduloVenda,
      vendaId: opts.vendaId,
    })) as ClienteDespesaRegistro[];
    const veiculoIds = [
      ...new Set(
        despesas
          .map((d) => String(d.veiculoId ?? "").trim())
          .filter((id) => id.length > 0),
      ),
    ];
    if (veiculoId) veiculoIds.push(veiculoId);
    const enriquecimento = await loadCatalogoEnriquecimentoDespesas(despesas, {
      clienteIds: clienteId ? [clienteId] : undefined,
      veiculoIds: veiculoIds.length ? [...new Set(veiculoIds)] : undefined,
    });
    const contratos = await queryContratosFromSql({
      ...(clienteId ? { clienteId } : {}),
      ...(veiculoIds.length ? { veiculoIds: [...new Set(veiculoIds)] } : {}),
      skipSnapshots: true,
    });
    return {
      despesas,
      clientes: enriquecimento.clientes,
      veiculos: enriquecimento.veiculos,
      contratos: contratos as ContratoRegistro[],
    };
  }

  const [clientesDb, veiculosDb, despesasDb, contratosDb] = await Promise.all([
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadClienteDespesasDbAsync(),
    loadContratosDbAsync(clienteId ? { clienteId } : undefined),
  ]);
  return {
    despesas: despesasDb.clienteDespesas,
    clientes: clientesDb.clientes,
    veiculos: veiculosDb.veiculos,
    contratos: contratosDb.contratos,
  };
}

export function listarDespesas(opts: ListarDespesasOpts = {}): {
  total: number;
  items: DespesaClienteListagem[];
} {
  const catalogo: DespesasCatalogo = {
    despesas: loadClienteDespesasDb().clienteDespesas,
    clientes: loadClientesDb().clientes,
    veiculos: [],
    contratos: [],
  };
  const items = filtrarDespesas([...catalogo.despesas], opts, catalogo);
  const enriquecidas = items.map((d) => enriquecerDespesaCliente(d, catalogo));
  return {
    total: enriquecidas.length,
    items: ordenarDespesasPorVencimentoDesc(enriquecidas),
  };
}

export async function listarDespesasAsync(opts: ListarDespesasOpts = {}): Promise<{
  total: number;
  items: DespesaClienteListagem[];
}> {
  const catalogo = await loadDespesasCatalogo(opts);
  const items = filtrarDespesas([...catalogo.despesas], opts, catalogo);
  const enriquecidas = items.map((d) => enriquecerDespesaCliente(d, catalogo));
  return {
    total: enriquecidas.length,
    items: ordenarDespesasPorVencimentoDesc(enriquecidas),
  };
}

export function obterDespesa(id: string): ClienteDespesaRegistro | null {
  return findClienteDespesaById(id);
}

export async function obterDespesaAsync(id: string): Promise<DespesaClienteListagem | null> {
  const catalogo = await loadDespesasCatalogo();
  const key = id.trim();
  const item =
    catalogo.despesas.find((d) => d.id === key) ??
    catalogo.despesas.find((d) => d.autoInfracao.trim().toLowerCase() === key.toLowerCase()) ??
    (await findClienteDespesaByIdAsync(key));
  if (!item) return null;
  return enriquecerDespesaCliente(item, catalogo);
}

export async function criarDespesa(
  veiculoId: string,
  input: ClienteDespesaInput,
  opts?: SyncOpts,
) {
  if (!veiculoId?.trim()) {
    throw new HttpError(400, 'Campo "veiculoId" é obrigatório');
  }
  if (!input.autoInfracao?.trim()) {
    throw new HttpError(400, 'Campo "autoInfracao" é obrigatório');
  }
  if (!input.descricao?.trim()) {
    throw new HttpError(400, 'Campo "descricao" é obrigatório');
  }

  const r = await gravarClienteDespesa(veiculoId, input, {
    syncRastreame: resolveSyncRastreame(opts?.syncRastreame !== false ? undefined : false),
    skipProximaParcela: opts?.skipProximaParcela,
    veiculoId: opts?.veiculoId,
  });
  return {
    data: r.registro,
    duplicado: r.duplicado ?? false,
    aviso: r.aviso,
    proximaParcela: r.proximaParcela ?? null,
  };
}

export async function atualizarDespesa(
  idOrAuto: string,
  patch: ClienteDespesaPatch,
  opts?: SyncOpts,
) {
  const r = await editarClienteDespesa(idOrAuto, patch, {
    syncRastreame: resolveSyncRastreame(opts?.syncRastreame !== false ? undefined : false),
    skipProximaParcela: opts?.skipProximaParcela,
  });
  if (!r) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  const item = await obterDespesaAsync(idOrAuto);
  return {
    data: item ?? r.registro,
    proximaParcela: r.proximaParcela ?? null,
  };
}

export async function removerDespesa(idOrAuto: string, opts?: SyncOpts) {
  const item = await excluirClienteDespesa(idOrAuto, {
    syncRastreame: resolveSyncRastreame(opts?.syncRastreame !== false ? undefined : false),
  });
  if (!item) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return item;
}

export async function confirmarClienteDespesa(
  idOuAuto: string,
  clienteId?: string | null,
  opts?: SyncOpts,
) {
  const item = await confirmarCondutorClienteDespesa(idOuAuto, clienteId, {
    syncRastreame: resolveSyncRastreame(opts?.syncRastreame !== false ? undefined : false),
  });
  if (!item) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return item;
}

/** @deprecated use confirmarClienteDespesa */
export const confirmarCondutorDespesa = confirmarClienteDespesa;

export async function confirmarParceiroDespesa(autoInfracao: string, parceiroId?: string | null) {
  const item = await confirmarDebitoParceiroDespesa(autoInfracao, parceiroId);
  if (!item) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return item;
}

/** Resolve placa a partir do veiculoId (útil para o frontend). */
export function placaDoVeiculoId(veiculoId: string): string | null {
  return findVeiculoById(veiculoId)?.placa ?? null;
}

export async function placaDoVeiculoIdAsync(veiculoId: string): Promise<string | null> {
  const veiculosDb = await loadVeiculosDbAsync();
  return veiculosDb.veiculos.find((v) => v.id === veiculoId)?.placa ?? null;
}

export function patchParaInput(
  patch: ClienteDespesaPatch,
  defaults?: Partial<ClienteDespesaInput>,
): ClienteDespesaInput {
  return {
    autoInfracao: defaults?.autoInfracao ?? `LOCAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    descricao: String(patch.descricao ?? defaults?.descricao ?? "").trim(),
    localInfracao: String(patch.localInfracao ?? defaults?.localInfracao ?? "").trim(),
    dataAutuacao: String(patch.dataAutuacao ?? defaults?.dataAutuacao ?? "").trim(),
    valorMulta: patch.valorMulta ?? defaults?.valorMulta ?? 0,
    situacao: String(patch.situacao ?? defaults?.situacao ?? "Em aberto").trim(),
    limiteDefesa: String(patch.limiteDefesa ?? defaults?.limiteDefesa ?? "").trim(),
    categoria: patch.categoria ?? defaults?.categoria,
    titulo: patch.titulo ?? defaults?.titulo,
    condutorId: patch.condutorId ?? defaults?.condutorId,
    paga: patch.paga ?? defaults?.paga,
    statusCobranca: patch.statusCobranca ?? defaults?.statusCobranca,
    pagaEm: patch.pagaEm ?? defaults?.pagaEm,
    rastreameMotoristaKey: patch.rastreameMotoristaKey ?? defaults?.rastreameMotoristaKey,
    rastreameRastreavelKey: patch.rastreameRastreavelKey ?? defaults?.rastreameRastreavelKey,
    rastreameDataIso: patch.rastreameDataIso ?? defaults?.rastreameDataIso,
    rastreameTipo: patch.rastreameTipo ?? defaults?.rastreameTipo,
    origem: defaults?.origem ?? "api",
  };
}

export async function atribuirClientesDespesas(opts: {
  dryRun?: boolean;
  veiculoId?: string;
  placa?: string;
  prazoDias?: number;
  escopo?: "pedagio" | "estacionamento";
}) {
  if (opts.escopo === "estacionamento") {
    return reconciliarCondutores({
      ...opts,
      escopoDespesa: "estacionamento",
      somenteEstacionamento: true,
    });
  }
  return reconciliarCondutores({
    ...opts,
    escopoDespesa: "pedagio",
    somentePedagios: true,
    incluirPedagios: true,
  });
}
