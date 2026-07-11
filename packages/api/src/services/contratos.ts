import {
  loadContratosDb,
  type ContratoRegistro,
} from "../lib-imports.js";

export type ListarContratosOpts = {
  status?: "ativo" | "encerrado";
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
};

function normPlacaQuery(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function listarContratos(opts: ListarContratosOpts = {}): {
  total: number;
  items: ContratoRegistro[];
} {
  let items = loadContratosDb().contratos;

  if (opts.status) {
    items = items.filter((c) => c.status === opts.status);
  }
  if (opts.clienteId?.trim()) {
    const id = opts.clienteId.trim();
    items = items.filter((c) => c.clienteId === id);
  }
  if (opts.veiculoId?.trim()) {
    const id = opts.veiculoId.trim();
    items = items.filter((c) => c.veiculoId === id);
  }
  if (opts.placa?.trim()) {
    const p = normPlacaQuery(opts.placa);
    items = items.filter((c) => normPlacaQuery(c.placa) === p);
  }

  return { total: items.length, items };
}

export function obterContrato(id: string): ContratoRegistro | null {
  const key = id.trim();
  return loadContratosDb().contratos.find((c) => c.id === key) ?? null;
}
