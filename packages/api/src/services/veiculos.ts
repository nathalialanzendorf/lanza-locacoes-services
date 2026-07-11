import crypto from "node:crypto";

import {
  editarVeiculo,
  excluirVeiculo,
  findVeiculoById,
  findVeiculoByPlaca,
  formatPlacaHyphen,
  isVeiculoAtivo,
  loadVeiculosDb,
  saveVeiculosDb,
  type VeiculoPatch,
  type VeiculoRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { vincularVeiculoParceiro, criarParceiro } from "./parceiros.js";

export type ListarVeiculosOpts = {
  ativo?: boolean;
  placa?: string;
};

export function listarVeiculos(opts: ListarVeiculosOpts = {}): {
  total: number;
  items: VeiculoRegistro[];
} {
  if (opts.placa?.trim()) {
    const um = findVeiculoByPlaca(opts.placa);
    const items = um ? [um] : [];
    return { total: items.length, items };
  }

  let items = loadVeiculosDb().veiculos;

  if (opts.ativo === true) {
    items = items.filter(isVeiculoAtivo);
  } else if (opts.ativo === false) {
    items = items.filter((v) => !isVeiculoAtivo(v));
  }

  return { total: items.length, items };
}

export function obterVeiculo(idOuPlaca: string): VeiculoRegistro | null {
  const byId = findVeiculoById(idOuPlaca);
  if (byId) return byId;
  return findVeiculoByPlaca(idOuPlaca);
}

export function atualizarVeiculo(
  idOuPlaca: string,
  patch: VeiculoPatch,
): VeiculoRegistro {
  const item = editarVeiculo(idOuPlaca, patch);
  if (!item) {
    throw new HttpError(404, "Veículo não encontrado");
  }
  return item;
}

export function removerVeiculo(idOuPlaca: string): VeiculoRegistro {
  const item = excluirVeiculo(idOuPlaca);
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

  const db = loadVeiculosDb();
  const existente = findVeiculoByPlaca(placa);
  const ts = new Date().toISOString();
  let acao: "novo" | "atualizado";
  let registro: VeiculoRegistro;

  if (existente) {
    const { parceiroNome: _pn, parceiroId: _pi, syncFipe: _sf, ...patchRaw } = input;
    const patch: VeiculoPatch = { ...patchRaw, ativo: input.ativo !== false };
    const atualizado = editarVeiculo(existente.id, patch);
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
    saveVeiculosDb(db);
    acao = "novo";
  }

  let vinculo = null;
  if (input.parceiroId) {
    vinculo = vincularVeiculoParceiro(registro.id, input.parceiroId);
  } else if (input.parceiroNome?.trim()) {
    const p = criarParceiro(input.parceiroNome.trim());
    vinculo = vincularVeiculoParceiro(registro.id, p.id);
  }

  if (input.syncFipe) {
    try {
      const { atualizarFipeVeiculo } = await import("./fipe.js");
      await atualizarFipeVeiculo(registro.placa);
      registro = findVeiculoById(registro.id) ?? registro;
    } catch {
      /* FIPE opcional */
    }
  }

  return { data: registro, acao, vinculo };
}
