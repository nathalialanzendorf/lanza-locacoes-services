import {
  despesaAtribuidaACliente,
  findClienteDespesaById,
  findVeiculoById,
  findVeiculoByPlaca,
  isClienteDespesaAtiva,
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "../lib-imports.js";

export type ListarDespesasOpts = {
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
  emAberto?: boolean;
  ativo?: boolean;
};

function despesaEmAberto(d: ClienteDespesaRegistro): boolean {
  return d.paga !== true && (d.situacao === "Em aberto" || !d.paga);
}

function normPlacaQuery(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

/** Resolve placa a partir do veiculoId (útil para o frontend). */
export function placaDoVeiculoId(veiculoId: string): string | null {
  return findVeiculoById(veiculoId)?.placa ?? null;
}
