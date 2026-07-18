import {
  reconciliarCondutores,
  confirmarDebitoParceiroInfracao,
  compactPlaca,
  findInfracaoByNumeroAuto,
  findVeiculoById,
  findVeiculoByPlaca,
  loadInfracoesDb,
  placasIguais,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
} from "../lib-imports.js";
import { listarVinculos } from "./parceiros.js";
import { HttpError } from "../http.js";

export type ListarInfracoesOpts = {
  placa?: string;
  veiculoId?: string;
  clienteId?: string;
  parceiroId?: string;
  emAberto?: boolean;
  semCliente?: boolean;
  /** @deprecated use semCliente */
  semCondutor?: boolean;
  ativo?: boolean;
};

function infracaoEmAberto(i: InfracaoRegistro): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

/** Em infracoes.json, `veiculoId` guarda a placa (DETRAN), não o uuid do veículo. */
function infracaoPertenceVeiculo(
  infracao: InfracaoRegistro,
  veiculo: { id: string; placa: string },
): boolean {
  if (infracao.veiculoId === veiculo.id) return true;
  return placasIguais(infracao.veiculoId, veiculo.placa);
}

function filtrarInfracoesPorVeiculoRef(
  items: InfracaoRegistro[],
  idOuPlaca: string,
): InfracaoRegistro[] {
  const ref = idOuPlaca.trim();
  const veiculo = findVeiculoById(ref) ?? findVeiculoByPlaca(ref);
  if (veiculo) {
    return items.filter((i) => infracaoPertenceVeiculo(i, veiculo));
  }
  return items.filter(
    (i) => i.veiculoId === ref || placasIguais(i.veiculoId, ref),
  );
}

export function listarInfracoes(opts: ListarInfracoesOpts = {}): {
  total: number;
  items: InfracaoRegistro[];
} {
  let items = loadInfracoesDb().infracoes;

  if (opts.veiculoId?.trim()) {
    items = filtrarInfracoesPorVeiculoRef(items, opts.veiculoId);
  } else if (opts.placa?.trim()) {
    items = filtrarInfracoesPorVeiculoRef(items, opts.placa);
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

  const semCliente = opts.semCliente === true || opts.semCondutor === true;
  if (semCliente) {
    items = items.filter(
      (i) => !i.condutorId && !i.debitoParceiroConfirmado && !i.condutorNaoIdentificado,
    );
  }

  if (opts.clienteId?.trim()) {
    const id = opts.clienteId.trim();
    items = items.filter((i) => i.condutorId === id);
  }

  if (opts.parceiroId?.trim()) {
    const pid = opts.parceiroId.trim();
    const vinculos = listarVinculos({ parceiroId: pid }).items;
    const veiculoIds = new Set(vinculos.map((v) => v.veiculoId));
    const placaKeys = new Set<string>();
    for (const vid of veiculoIds) {
      placaKeys.add(compactPlaca(vid));
      const veiculo = findVeiculoById(vid);
      if (veiculo) placaKeys.add(compactPlaca(veiculo.placa));
    }
    items = items.filter(
      (i) =>
        i.debitoParceiroId === pid ||
        veiculoIds.has(i.veiculoId) ||
        placaKeys.has(compactPlaca(i.veiculoId)),
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

export async function atribuirClientesInfracoes(opts: {
  dryRun?: boolean;
  placa?: string;
  prazoDias?: number;
  incluirPedagios?: boolean;
}) {
  return reconciliarCondutores(opts);
}

/** @deprecated use atribuirClientesInfracoes */
export const atribuirCondutoresInfracoes = atribuirClientesInfracoes;

export function infracoesPorVeiculo(veiculoId: string) {
  const v = findVeiculoById(veiculoId);
  if (!v) throw new HttpError(404, "Veículo não encontrado");
  return listarInfracoes({ veiculoId });
}
