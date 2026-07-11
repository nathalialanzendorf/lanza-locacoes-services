import {
  confirmarDebitoParceiroInfracao,
  findInfracaoByNumeroAuto,
  findVeiculoById,
  findVeiculoByPlaca,
  loadInfracoesDb,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ListarInfracoesOpts = {
  placa?: string;
  veiculoId?: string;
  emAberto?: boolean;
  semCondutor?: boolean;
  ativo?: boolean;
};

function infracaoEmAberto(i: InfracaoRegistro): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

export function listarInfracoes(opts: ListarInfracoesOpts = {}): {
  total: number;
  items: InfracaoRegistro[];
} {
  let items = loadInfracoesDb().infracoes;

  if (opts.veiculoId?.trim()) {
    items = items.filter((i) => i.veiculoId === opts.veiculoId.trim());
  } else if (opts.placa?.trim()) {
    const v = findVeiculoByPlaca(opts.placa);
    if (!v) return { total: 0, items: [] };
    items = items.filter((i) => i.veiculoId === v.id);
  }

  if (opts.ativo === true) {
    items = items.filter((i) => i.ativo !== false);
  } else if (opts.ativo === false) {
    items = items.filter((i) => i.ativo === false);
  }

  if (opts.emAberto === true) {
    items = items.filter(infracaoEmAberto);
  } else if (opts.emAberto === false) {
    items = items.filter((i) => !infracaoEmAberto(i));
  }

  if (opts.semCondutor === true) {
    items = items.filter(
      (i) => !i.condutorId && !i.debitoParceiroConfirmado && !i.condutorNaoIdentificado,
    );
  }

  return { total: items.length, items };
}

export function obterInfracao(numeroAuto: string): InfracaoRegistro | null {
  return findInfracaoByNumeroAuto(numeroAuto);
}

export function confirmarParceiroInfracao(numeroAuto: string, parceiroId?: string | null) {
  const item = confirmarDebitoParceiroInfracao(numeroAuto, parceiroId);
  if (!item) throw new HttpError(404, "Infração não encontrada");
  return item;
}

export function vincularDespesaInfracao(numeroAuto: string, clienteDespesaId: string) {
  const item = vincularClienteDespesaInfracao(numeroAuto, clienteDespesaId);
  if (!item) throw new HttpError(404, "Infração não encontrada");
  return item;
}

export function infracoesPorVeiculo(veiculoId: string) {
  const v = findVeiculoById(veiculoId);
  if (!v) throw new HttpError(404, "Veículo não encontrado");
  return listarInfracoes({ veiculoId });
}
