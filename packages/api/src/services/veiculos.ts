import crypto from "node:crypto";

import {
  editarVeiculoAsync,
  excluirVeiculoAsync,
  formatPlacaHyphen,
  isVeiculoAtivo,
  loadVeiculosDb,
  loadVeiculosDbAsync,
  placasIguais,
  saveVeiculosDbAsync,
  type VeiculoPatch,
  type VeiculoRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { criarParceiroAsync, vincularVeiculoParceiroAsync } from "./parceiros.js";

export type ListarVeiculosOpts = {
  ativo?: boolean;
  placa?: string;
};

export function listarVeiculos(opts: ListarVeiculosOpts = {}): {
  total: number;
  items: VeiculoRegistro[];
} {
  return filtrarVeiculos(loadVeiculosDb().veiculos, opts);
}

export async function listarVeiculosAsync(opts: ListarVeiculosOpts = {}): Promise<{
  total: number;
  items: VeiculoRegistro[];
}> {
  const db = await loadVeiculosDbAsync({
    placa: opts.placa,
    ativo: opts.ativo,
  });
  return filtrarVeiculos(db.veiculos, opts);
}

function filtrarVeiculos(
  veiculos: VeiculoRegistro[],
  opts: ListarVeiculosOpts,
): { total: number; items: VeiculoRegistro[] } {
  if (opts.placa?.trim()) {
    const um = veiculos.find((v) => placasIguais(v.placa, opts.placa!));
    const items = um ? [um] : [];
    return { total: items.length, items };
  }

  let items = veiculos;

  if (opts.ativo === true) {
    items = items.filter(isVeiculoAtivo);
  } else if (opts.ativo === false) {
    items = items.filter((v) => !isVeiculoAtivo(v));
  }

  return { total: items.length, items };
}

export async function obterVeiculoAsync(idOuPlaca: string): Promise<VeiculoRegistro | null> {
  const db = await loadVeiculosDbAsync();
  const byId = db.veiculos.find((v) => v.id === idOuPlaca);
  if (byId) return byId;
  return db.veiculos.find((v) => placasIguais(v.placa, idOuPlaca)) ?? null;
}

export async function atualizarVeiculoAsync(
  idOuPlaca: string,
  patch: VeiculoPatch,
): Promise<VeiculoRegistro> {
  const item = await editarVeiculoAsync(idOuPlaca, patch);
  if (!item) {
    throw new HttpError(404, "Veículo não encontrado");
  }
  return item;
}

export async function removerVeiculoAsync(idOuPlaca: string): Promise<VeiculoRegistro> {
  const item = await excluirVeiculoAsync(idOuPlaca);
  if (!item) {
    throw new HttpError(404, "Veículo não encontrado");
  }
  return item;
}

export type CriarVeiculoInput = Partial<VeiculoRegistro> & {
  placa: string;
  parceiroNome?: string;
  parceiroId?: string;
  syncFipe?: boolean;
};

export async function criarVeiculo(input: CriarVeiculoInput): Promise<{
  data: VeiculoRegistro;
  acao: "novo" | "atualizado";
  vinculo?: unknown;
}> {
  const placa = formatPlacaHyphen(input.placa);
  if (!placa) throw new HttpError(400, 'Campo "placa" é obrigatório');

  const db = await loadVeiculosDbAsync();
  const existente = db.veiculos.find((v) => placasIguais(v.placa, placa)) ?? null;
  const ts = new Date().toISOString();
  let acao: "novo" | "atualizado";
  let registro: VeiculoRegistro;

  if (existente) {
    const { parceiroNome: _pn, parceiroId: _pi, syncFipe: _sf, ...patchRaw } = input;
    const patch: VeiculoPatch = { ...patchRaw, ativo: input.ativo !== false };
    const atualizado = await editarVeiculoAsync(existente.id, patch);
    if (!atualizado) throw new HttpError(500, "Falha ao atualizar veículo");
    registro = atualizado;
    acao = "atualizado";
  } else {
    const { placa: _p, parceiroNome: _pn, parceiroId: _pi, syncFipe: _sf, ...rest } = input;
    registro = {
      ...rest,
      id: crypto.randomUUID(),
      placa,
      ativo: input.ativo !== false,
      origem: (input.origem as string | undefined) ?? "api",
      atualizadoEm: ts,
    };
    db.veiculos.push(registro);
    await saveVeiculosDbAsync(db);
    acao = "novo";
  }

  let vinculo = null;
  if (input.parceiroId) {
    vinculo = await vincularVeiculoParceiroAsync(registro.id, input.parceiroId);
  } else if (input.parceiroNome?.trim()) {
    const p = await criarParceiroAsync(input.parceiroNome.trim());
    vinculo = await vincularVeiculoParceiroAsync(registro.id, p.id);
  }

  if (input.syncFipe) {
    try {
      const { atualizarFipeVeiculo } = await import("./fipe.js");
      await atualizarFipeVeiculo(registro.placa);
      registro = (await obterVeiculoAsync(registro.id)) ?? registro;
    } catch {
      /* FIPE opcional */
    }
  }

  return { data: registro, acao, vinculo };
}
