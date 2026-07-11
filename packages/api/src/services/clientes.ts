import {
  editarCliente,
  excluirCliente,
  findClienteByCpf,
  findClienteById,
  gravarCliente,
  isClienteAtivo,
  loadClientesDb,
  type ClienteImportado,
  type ClientePatch,
  type ClienteRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

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
