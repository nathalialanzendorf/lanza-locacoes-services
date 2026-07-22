import {
  editarClienteAsync,
  excluirClienteAsync,
  findClienteByCpf,
  findClienteById,
  findClienteInDb,
  gravarClienteAsync,
  isClienteAtivo,
  isSyncRastreameEligible,
  loadClientesDb,
  loadClientesDbAsync,
  replicarClienteNoRastreame,
  type ClienteImportado,
  type ClientePatch,
  type ClienteRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ListarClientesOpts = {
  ativo?: boolean;
  /** CPF para busca em tela (filtro direto na listagem de clientes). */
  cpf?: string;
};

function filtrarClientes(
  items: ClienteRegistro[],
  opts: ListarClientesOpts,
): ClienteRegistro[] {
  let out = items;

  if (opts.cpf?.trim()) {
    const key = opts.cpf.replace(/\D/g, "");
    if (key.length === 11) {
      out = out.filter((c) => c.cpf?.replace(/\D/g, "") === key);
    }
  }

  if (opts.ativo === true) {
    return out.filter(isClienteAtivo);
  }
  if (opts.ativo === false) {
    return out.filter((c) => !isClienteAtivo(c));
  }
  return out;
}

async function espelharClienteRastreame(c: ClienteRegistro): Promise<void> {
  if (!isSyncRastreameEligible(c)) return;
  try {
    await replicarClienteNoRastreame(c, { forcePush: c.ativo === false });
  } catch (err) {
    console.error(
      `[clientes] falha ao replicar no Rastreame (${c.nome}):`,
      err instanceof Error ? err.message : String(err),
    );
  }
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

export async function criarCliente(body: ClienteImportado): Promise<{
  data: ClienteRegistro;
  acao: string;
}> {
  const nome = String(body.nome ?? "").trim();
  if (!nome) {
    throw new HttpError(400, 'Campo "nome" é obrigatório');
  }
  const r = await gravarClienteAsync({ ...body, nome });
  await espelharClienteRastreame(r.registro);
  const db = await loadClientesDbAsync();
  const atualizado = findClienteInDb(db, r.registro.id) ?? r.registro;
  return { data: atualizado, acao: r.acao };
}

export async function atualizarClienteAsync(
  idOuCpf: string,
  patch: ClientePatch,
): Promise<ClienteRegistro> {
  const item = await editarClienteAsync(idOuCpf, patch);
  if (!item) {
    throw new HttpError(404, "Cliente não encontrado");
  }
  await espelharClienteRastreame(item);
  return findClienteById(item.id) ?? item;
}

export async function removerClienteAsync(idOuCpf: string): Promise<ClienteRegistro> {
  const item = await excluirClienteAsync(idOuCpf);
  if (!item) {
    throw new HttpError(404, "Cliente não encontrado");
  }
  await espelharClienteRastreame(item);
  return findClienteById(item.id) ?? item;
}
