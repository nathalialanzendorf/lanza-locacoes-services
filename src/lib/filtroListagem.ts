/**
 * CPF e placa são aceitos apenas como entrada humana em filtros de listagem.
 * Joins entre tabelas usam sempre PK/FK UUID (id, cliente_id, veiculo_id, …).
 */
import type { ClienteRegistro } from "./clientesDb.js";
import { normNomeKey } from "./clientesDb.js";
import { placasIguais } from "./placa.js";
import { findVeiculoById, findVeiculoByPlaca, type VeiculoRegistro } from "./veiculosDb.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PK/FK de entidade — sempre UUID v4. */
export function isEntityUuid(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && UUID_RE.test(value.trim()));
}

export type FiltroVeiculoEntrada = {
  veiculoId?: string | null;
  /** Placa para busca em tela — resolvida para veiculoId antes de consultas relacionadas. */
  placa?: string | null;
};

export type FiltroClienteEntrada = {
  clienteId?: string | null;
  /** Nome, CPF ou id — resolvido para clienteId antes de consultas relacionadas. */
  clienteQuery?: string | null;
  /** CPF para busca em tela — resolvido para clienteId antes de consultas relacionadas. */
  cpf?: string | null;
};

export type FiltroParceiroEntrada = {
  parceiroId?: string | null;
  /** Nome ou id — resolvido para parceiroId antes de consultas relacionadas. */
  parceiroQuery?: string | null;
  /** Nome para busca em tela (listagem de parceiros). */
  nome?: string | null;
};

type VeiculoRef = Pick<VeiculoRegistro, "id" | "placa">;
type ParceiroRef = { id: string; nome: string };

function veiculoPorRef(ref: string, veiculos: VeiculoRef[]): VeiculoRef | null {
  const key = ref.trim();
  if (!key) return null;
  return (
    veiculos.find((v) => v.id === key) ??
    veiculos.find((v) => placasIguais(v.placa, key)) ??
    findVeiculoById(key) ??
    findVeiculoByPlaca(key)
  );
}

/** Resolve placa ou id legado para UUID do veículo (somente catálogo de veículos). */
export function resolveVeiculoIdListagem(
  input: FiltroVeiculoEntrada,
  veiculos: VeiculoRef[] = [],
): string | undefined {
  const id = input.veiculoId?.trim();
  if (id) {
    const v = veiculoPorRef(id, veiculos);
    if (v?.id) return v.id;
    if (isEntityUuid(id)) return id;
  }
  const placa = input.placa?.trim();
  if (!placa) return undefined;
  return veiculoPorRef(placa, veiculos)?.id;
}

/** Resolve CPF, nome ou id para UUID do cliente (somente catálogo de clientes). */
export function resolveClienteIdListagem(
  input: FiltroClienteEntrada,
  clientes: ClienteRegistro[],
): string | undefined {
  const id = input.clienteId?.trim();
  if (id) {
    if (isEntityUuid(id)) return id;
    const byId = clientes.find((c) => c.id === id);
    if (byId?.id) return byId.id;
  }

  const cpfRaw = input.cpf?.trim();
  if (cpfRaw) {
    const key = cpfRaw.replace(/\D/g, "");
    if (key.length === 11) {
      const byCpf = clientes.find((c) => c.cpf?.replace(/\D/g, "") === key);
      if (byCpf?.id) return byCpf.id;
    }
  }

  const query = input.clienteQuery?.trim();
  if (!query) return undefined;

  const qLower = query.toLowerCase();
  const byId = clientes.find((c) => c.id?.toLowerCase() === qLower);
  if (byId?.id) return byId.id;

  const key = query.replace(/\D/g, "");
  if (key.length === 11) {
    const byCpf = clientes.find((c) => c.cpf?.replace(/\D/g, "") === key);
    if (byCpf?.id) return byCpf.id;
  }

  const nk = normNomeKey(query);
  const matches = clientes.filter((c) => {
    const cn = normNomeKey(c.nome);
    return cn.includes(nk) || nk.includes(cn);
  });
  if (matches.length === 1 && matches[0]?.id) return matches[0].id;

  return undefined;
}

/** Normaliza filtro de veículo para uso interno (somente veiculoId). */
export function normalizarFiltroVeiculoListagem<T extends FiltroVeiculoEntrada>(
  input: T,
  veiculos: VeiculoRef[] = [],
): Omit<T, "placa"> & { veiculoId?: string } {
  const veiculoId = resolveVeiculoIdListagem(input, veiculos);
  const { placa: _placa, veiculoId: _veiculoId, ...rest } = input;
  return {
    ...rest,
    ...(veiculoId ? { veiculoId } : {}),
  } as Omit<T, "placa"> & { veiculoId?: string };
}

/** Normaliza filtro de cliente para uso interno (somente clienteId). */
export function normalizarFiltroClienteListagem<T extends FiltroClienteEntrada>(
  input: T,
  clientes: ClienteRegistro[],
): Omit<T, "clienteQuery" | "cpf"> & { clienteId?: string } {
  const clienteId = resolveClienteIdListagem(input, clientes);
  const { clienteQuery: _q, cpf: _cpf, clienteId: _id, ...rest } = input;
  return {
    ...rest,
    ...(clienteId ? { clienteId } : {}),
  } as Omit<T, "clienteQuery" | "cpf"> & { clienteId?: string };
}

/** Resolve nome ou id para UUID do parceiro (somente catálogo de parceiros). */
export function resolveParceiroIdListagem(
  input: FiltroParceiroEntrada,
  parceiros: ParceiroRef[] = [],
): string | undefined {
  const id = input.parceiroId?.trim();
  if (id) {
    if (isEntityUuid(id)) return id;
    const byId = parceiros.find((p) => p.id === id);
    if (byId?.id) return byId.id;
  }

  const query = input.parceiroQuery?.trim() || input.nome?.trim();
  if (!query) return undefined;

  const qLower = query.toLowerCase();
  const byId = parceiros.find((p) => p.id?.toLowerCase() === qLower);
  if (byId?.id) return byId.id;

  const nk = normNomeKey(query);
  const matches = parceiros.filter((p) => {
    const pn = normNomeKey(p.nome);
    return pn.includes(nk) || nk.includes(pn);
  });
  if (matches.length === 1 && matches[0]?.id) return matches[0].id;

  return undefined;
}

/** Normaliza filtro de parceiro para uso interno (somente parceiroId). */
export function normalizarFiltroParceiroListagem<T extends FiltroParceiroEntrada>(
  input: T,
  parceiros: ParceiroRef[] = [],
): Omit<T, "parceiroQuery" | "nome"> & { parceiroId?: string } {
  const parceiroId = resolveParceiroIdListagem(input, parceiros);
  const { parceiroQuery: _q, nome: _nome, parceiroId: _id, ...rest } = input;
  return {
    ...rest,
    ...(parceiroId ? { parceiroId } : {}),
  } as Omit<T, "parceiroQuery" | "nome"> & { parceiroId?: string };
}

/** Placa formatada a partir do veiculoId (exibição — não usar em joins). */
export function placaDoVeiculoIdListagem(
  veiculoId: string | undefined,
  veiculos: VeiculoRef[] = [],
): string | undefined {
  if (!veiculoId?.trim()) return undefined;
  const v = veiculoPorRef(veiculoId.trim(), veiculos);
  return v?.placa ? v.placa : undefined;
}
