import crypto from "node:crypto";

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
  loadClienteDespesasDb,
  loadClienteDespesasDbAsync,
  loadClientesDb,
  loadClientesDbAsync,
  loadVeiculosDbAsync,
  findVeiculoById,
  findVeiculoByPlaca,
  compactPlaca,
  formatPlacaHyphen,
  formatVeiculoLabel,
  vencimentoClienteDespesaBr,
  type ClienteDespesaInput,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
  type ClienteRegistro,
  type VeiculoRegistro,
  resolveSyncRastreame,
  reconciliarCondutores,
  dataStringNoPeriodo,
  isCategoriaPedagio,
  isCategoriaEstacionamento,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ListarDespesasOpts = {
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
  competencia?: string;
  emAberto?: boolean;
  ativo?: boolean;
  semCliente?: boolean;
  /** @deprecated use semCliente */
  semCondutor?: boolean;
  dataInicial?: string;
  dataFinal?: string;
};

export type SyncOpts = {
  syncRastreame?: boolean;
};

type DespesasCatalogo = {
  despesas: ClienteDespesaRegistro[];
  clientes: ClienteRegistro[];
  veiculos: VeiculoRegistro[];
};

function despesaEmAberto(d: ClienteDespesaRegistro): boolean {
  return d.paga !== true && (d.situacao === "Em aberto" || !d.paga);
}

function resolvePlacaFiltro(
  opts: ListarDespesasOpts,
  veiculos: VeiculoRegistro[],
): string | null {
  if (opts.placa?.trim()) {
    const v =
      veiculos.find((x) => compactPlaca(x.placa) === compactPlaca(opts.placa!)) ??
      findVeiculoByPlaca(opts.placa);
    return compactPlaca(v?.placa ?? opts.placa);
  }
  if (opts.veiculoId?.trim()) {
    const raw = opts.veiculoId.trim();
    const v =
      veiculos.find((x) => x.id === raw) ??
      findVeiculoById(raw) ??
      findVeiculoByPlaca(raw);
    return compactPlaca(v?.placa ?? raw);
  }
  return null;
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
  return (
    veiculos.find((v) => v.id === d.veiculoId) ??
    veiculos.find((v) => compactPlaca(v.placa) === compactPlaca(d.veiculoId)) ??
    findVeiculoById(d.veiculoId) ??
    findVeiculoByPlaca(d.veiculoId)
  );
}

function clienteNomeDespesa(d: ClienteDespesaRegistro, clientes: ClienteRegistro[]): string | null {
  const id = d.condutorId?.trim();
  if (!id) return null;
  const nome = clientes.find((c) => c.id === id)?.nome?.trim();
  return nome || null;
}

function enriquecerDespesaCliente(
  d: ClienteDespesaRegistro,
  catalogo: DespesasCatalogo,
): DespesaClienteListagem {
  const veiculo = veiculoDaDespesaCliente(d, catalogo.veiculos);
  const placa = veiculo?.placa ?? formatPlacaHyphen(d.veiculoId);
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
  const placaKey = resolvePlacaFiltro(opts, catalogo.veiculos);

  if (placaKey) {
    items = items.filter((d) => {
      const veiculo = veiculoDaDespesaCliente(d, catalogo.veiculos);
      return compactPlaca(veiculo?.placa ?? d.veiculoId) === placaKey;
    });
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

  if (opts.competencia?.trim()) {
    const comp = opts.competencia.trim();
    items = items.filter((d) => competenciaDeDespesa(d) === comp);
  }

  if (opts.ativo === true) {
    items = items.filter(isClienteDespesaAtiva);
  } else if (opts.ativo === false) {
    items = items.filter((d) => !isClienteDespesaAtiva(d));
  }

  if (opts.emAberto === true) {
    items = items.filter(despesaEmAberto);
  } else if (opts.emAberto === false) {
    items = items.filter((d) => !despesaEmAberto(d));
  }

  if (opts.clienteId?.trim()) {
    const clienteId = opts.clienteId.trim();
    items = items.filter((d) => {
      if (despesaAtribuidaACliente(d, clienteId)) return true;
      const veiculo = veiculoDaDespesaCliente(d, catalogo.veiculos);
      return veiculo?.clienteVinculadoId === clienteId;
    });
  }

  const semCliente = opts.semCliente === true || opts.semCondutor === true;
  if (semCliente) {
    items = items.filter((d) => !despesaResponsavelConfirmado(d));
  }

  if (opts.dataInicial?.trim() || opts.dataFinal?.trim()) {
    items = items.filter((d) =>
      dataStringNoPeriodo(d.dataAutuacao, {
        dataInicial: opts.dataInicial,
        dataFinal: opts.dataFinal,
      }),
    );
  }

  return items;
}

async function loadDespesasCatalogo(): Promise<DespesasCatalogo> {
  const [despesasDb, clientesDb, veiculosDb] = await Promise.all([
    loadClienteDespesasDbAsync(),
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
  ]);
  return {
    despesas: despesasDb.clienteDespesas,
    clientes: clientesDb.clientes,
    veiculos: veiculosDb.veiculos,
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
  };
  const items = filtrarDespesas([...catalogo.despesas], opts, catalogo);
  return {
    total: items.length,
    items: items.map((d) => enriquecerDespesaCliente(d, catalogo)),
  };
}

export async function listarDespesasAsync(opts: ListarDespesasOpts = {}): Promise<{
  total: number;
  items: DespesaClienteListagem[];
}> {
  const catalogo = await loadDespesasCatalogo();
  const items = filtrarDespesas([...catalogo.despesas], opts, catalogo);
  return {
    total: items.length,
    items: items.map((d) => enriquecerDespesaCliente(d, catalogo)),
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
  });
  if (!r) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return {
    data: r.registro,
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
  let autoInfracao = idOuAuto;
  const porId = await findClienteDespesaByIdAsync(idOuAuto);
  if (porId) autoInfracao = porId.autoInfracao;

  const item = await confirmarCondutorClienteDespesa(autoInfracao, clienteId, {
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
    paga: patch.paga ?? defaults?.paga,
    pagaEm: patch.pagaEm ?? defaults?.pagaEm,
    rastreameMotoristaKey: patch.rastreameMotoristaKey ?? defaults?.rastreameMotoristaKey,
    rastreameRastreavelKey: patch.rastreameRastreavelKey ?? defaults?.rastreameRastreavelKey,
    rastreameDataIso: patch.rastreameDataIso ?? defaults?.rastreameDataIso,
    origem: defaults?.origem ?? "api",
  };
}

export async function atribuirClientesDespesas(opts: {
  dryRun?: boolean;
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
