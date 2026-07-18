import {
  findContratoInDb,
  loadContratosDb,
  loadContratosDbAsync,
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

function filtrarContratos(
  items: ContratoRegistro[],
  opts: ListarContratosOpts,
): ContratoRegistro[] {
  let filtered = items;

  if (opts.status) {
    filtered = filtered.filter((c) => c.status === opts.status);
  }
  if (opts.clienteId?.trim()) {
    const id = opts.clienteId.trim();
    filtered = filtered.filter((c) => c.clienteId === id);
  }
  if (opts.veiculoId?.trim()) {
    const id = opts.veiculoId.trim();
    filtered = filtered.filter((c) => c.veiculoId === id);
  }
  if (opts.placa?.trim()) {
    const p = normPlacaQuery(opts.placa);
    filtered = filtered.filter((c) => normPlacaQuery(c.placa) === p);
  }

  return filtered;
}

export function listarContratos(opts: ListarContratosOpts = {}): {
  total: number;
  items: ContratoRegistro[];
} {
  const items = filtrarContratos(loadContratosDb().contratos, opts);
  return { total: items.length, items };
}

export async function listarContratosAsync(opts: ListarContratosOpts = {}): Promise<{
  total: number;
  items: ContratoRegistro[];
}> {
  const db = await loadContratosDbAsync();
  const items = filtrarContratos(db.contratos, opts);
  return { total: items.length, items };
}

export function obterContrato(id: string): ContratoRegistro | null {
  return findContratoInDb(loadContratosDb(), id);
}

export async function obterContratoAsync(id: string): Promise<ContratoRegistro | null> {
  const db = await loadContratosDbAsync();
  return findContratoInDb(db, id);
}
