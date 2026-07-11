import crypto from "node:crypto";

import {
  confirmarCondutorClienteDespesa,
  despesaAtribuidaACliente,
  editarClienteDespesa,
  excluirClienteDespesa,
  findClienteDespesaById,
  findVeiculoById,
  findVeiculoByPlaca,
  gravarClienteDespesa,
  isClienteDespesaAtiva,
  loadClienteDespesasDb,
  type ClienteDespesaInput,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ListarDespesasOpts = {
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
  emAberto?: boolean;
  ativo?: boolean;
};

export type SyncOpts = {
  syncRastreame?: boolean;
};

function despesaEmAberto(d: ClienteDespesaRegistro): boolean {
  return d.paga !== true && (d.situacao === "Em aberto" || !d.paga);
}

function resolveVeiculoId(opts: ListarDespesasOpts): string | undefined {
  if (opts.veiculoId?.trim()) return opts.veiculoId.trim();
  if (!opts.placa?.trim()) return undefined;
  const v = findVeiculoByPlaca(opts.placa);
  return v?.id;
}

export function listarDespesas(opts: ListarDespesasOpts = {}): {
  total: number;
  items: ClienteDespesaRegistro[];
} {
  let items = loadClienteDespesasDb().clienteDespesas;
  const veiculoId = resolveVeiculoId(opts);

  if (veiculoId) {
    items = items.filter((d) => d.veiculoId === veiculoId);
  }

  if (opts.categoria?.trim()) {
    const cat = opts.categoria.trim().toLowerCase();
    items = items.filter((d) => (d.categoria ?? "").trim().toLowerCase() === cat);
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
    items = items.filter((d) => despesaAtribuidaACliente(d, clienteId));
  }

  return { total: items.length, items };
}

export function obterDespesa(id: string): ClienteDespesaRegistro | null {
  return findClienteDespesaById(id);
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
    syncRastreame: opts?.syncRastreame !== false,
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
    syncRastreame: opts?.syncRastreame !== false,
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
    syncRastreame: opts?.syncRastreame !== false,
  });
  if (!item) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return item;
}

export async function confirmarCondutorDespesa(
  autoInfracao: string,
  condutorId?: string | null,
  opts?: SyncOpts,
) {
  const item = await confirmarCondutorClienteDespesa(autoInfracao, condutorId, {
    syncRastreame: opts?.syncRastreame !== false,
  });
  if (!item) {
    throw new HttpError(404, "Despesa não encontrada");
  }
  return item;
}

/** Resolve placa a partir do veiculoId (útil para o frontend). */
export function placaDoVeiculoId(veiculoId: string): string | null {
  return findVeiculoById(veiculoId)?.placa ?? null;
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
