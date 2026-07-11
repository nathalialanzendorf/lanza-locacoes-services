import {
  findVeiculoById,
  findVeiculoByPlaca,
  isVeiculoAtivo,
  loadVeiculosDb,
  type VeiculoRegistro,
} from "../lib-imports.js";

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
