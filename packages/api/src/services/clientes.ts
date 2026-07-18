import {
  editarCliente,
  excluirCliente,
  findClienteByCpf,
  findClienteById,
  findClienteInDb,
  gravarCliente,
  isClienteAtivo,
  loadClientesDb,
  loadClientesDbAsync,
  type ClienteImportado,
  type ClientePatch,
  type ClienteRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ListarClientesOpts = {
  ativo?: boolean;
};

function filtrarClientes(
  items: ClienteRegistro[],
  opts: ListarClientesOpts,
): ClienteRegistro[] {
  if (opts.ativo === true) {
    return items.filter(isClienteAtivo);
  }
  if (opts.ativo === false) {
    return items.filter((c) => !isClienteAtivo(c));
  }
  return items;
}

export function listarClientes(opts: ListarClientesOpts = {}): {
  total: number;
  items: ClienteRegistro[];
} {
  const items = filtrarClientes(loadClientesDb().clientes, opts);
  return { total: items.length, items };
}

export async function listarClientesAsync(opts: ListarClientesOpts = {}): Promise<{
  total: number;
  items: ClienteRegistro[];
}> {
  const db = await loadClientesDbAsync();
  const items = filtrarClientes(db.clientes, opts);
  return { total: items.length, items };
}

export function obterCliente(idOuCpf: string): ClienteRegistro | null {
  const byId = findClienteById(idOuCpf);
  if (byId) return byId;
  return findClienteByCpf(idOuCpf);
}

export async function obterClienteAsync(idOuCpf: string): Promise<ClienteRegistro | null> {
  const db = await loadClientesDbAsync();
  return findClienteInDb(db, idOuCpf);
}

export function criarCliente(body: ClienteImportado): {
  data: ClienteRegistro;
  acao: string;
} {
  const nome = String(body.nome ?? "").trim();
  if (!nome) {
    throw new HttpError(400, 'Campo "nome" é obrigatório');
  }
  const r = gravarCliente({ ...body, nome });
  return { data: r.registro, acao: r.acao };
}

export function atualizarCliente(
  idOuCpf: string,
  patch: ClientePatch,
): ClienteRegistro {
  const item = editarCliente(idOuCpf, patch);
  if (!item) {
    throw new HttpError(404, "Cliente não encontrado");
  }
  return item;
}

export function removerCliente(idOuCpf: string): ClienteRegistro {
  const item = excluirCliente(idOuCpf);
  if (!item) {
    throw new HttpError(404, "Cliente não encontrado");
  }
  return item;
}
