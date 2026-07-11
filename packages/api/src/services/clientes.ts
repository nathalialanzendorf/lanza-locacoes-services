import {
  findClienteByCpf,
  findClienteById,
  isClienteAtivo,
  loadClientesDb,
  type ClienteRegistro,
} from "../lib-imports.js";

export type ListarClientesOpts = {
  ativo?: boolean;
};

export function listarClientes(opts: ListarClientesOpts = {}): {
  total: number;
  items: ClienteRegistro[];
} {
  let items = loadClientesDb().clientes;

  if (opts.ativo === true) {
    items = items.filter(isClienteAtivo);
  } else if (opts.ativo === false) {
    items = items.filter((c) => !isClienteAtivo(c));
  }

  return { total: items.length, items };
}

export function obterCliente(idOuCpf: string): ClienteRegistro | null {
  const byId = findClienteById(idOuCpf);
  if (byId) return byId;
  return findClienteByCpf(idOuCpf);
}
