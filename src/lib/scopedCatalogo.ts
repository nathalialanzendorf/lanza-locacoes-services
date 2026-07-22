import {
  loadClientesByIdsFromSql,
  queryVeiculosByIdsFromSql,
  type ClientesSqlFilter,
  type VeiculosSqlFilter,
} from "@lanza/db";

import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import type { ClienteRegistro } from "./clientesDb.js";
import { isEntityUuid } from "./filtroListagem.js";
import type { VeiculoRegistro } from "./veiculosDb.js";

export function collectIdsFromDespesas(despesas: ClienteDespesaRegistro[]): {
  clienteIds: string[];
  veiculoIds: string[];
} {
  const clienteIds = new Set<string>();
  const veiculoIds = new Set<string>();
  for (const d of despesas) {
    const cid = String(d.condutorId ?? "").trim();
    if (isEntityUuid(cid)) clienteIds.add(cid);
    const vid = String(d.veiculoId ?? "").trim();
    if (isEntityUuid(vid)) veiculoIds.add(vid);
  }
  return { clienteIds: [...clienteIds], veiculoIds: [...veiculoIds] };
}

/** Catálogo mínimo para enriquecer listagens de despesas (labels de cliente/veículo). */
export async function loadCatalogoEnriquecimentoDespesas(
  despesas: ClienteDespesaRegistro[],
  extras?: { clienteIds?: string[]; veiculoIds?: string[] },
): Promise<{ clientes: ClienteRegistro[]; veiculos: VeiculoRegistro[] }> {
  const collected = collectIdsFromDespesas(despesas);
  const clienteIds = [...new Set([...(extras?.clienteIds ?? []), ...collected.clienteIds])];
  const veiculoIds = [...new Set([...(extras?.veiculoIds ?? []), ...collected.veiculoIds])];

  const [clientes, veiculos] = await Promise.all([
    clienteIds.length > 0 ? loadClientesByIdsFromSql(clienteIds) : Promise.resolve([]),
    veiculoIds.length > 0 ? queryVeiculosByIdsFromSql(veiculoIds) : Promise.resolve([]),
  ]);

  return {
    clientes: clientes as ClienteRegistro[],
    veiculos: veiculos as VeiculoRegistro[],
  };
}

export function clientesScopeFromFilter(input: {
  ids?: string[];
  idOuCpf?: string;
  cpf?: string;
  nome?: string;
  clienteQuery?: string;
  q?: string;
  ativo?: boolean;
}): ClientesSqlFilter | null {
  const ids = [...new Set((input.ids ?? []).filter((id) => isEntityUuid(id.trim())).map((id) => id.trim()))];
  const idOuCpf = input.idOuCpf?.trim();
  if (idOuCpf && isEntityUuid(idOuCpf)) ids.push(idOuCpf);

  const cpf = input.cpf?.trim();
  const q = input.clienteQuery?.trim() || input.q?.trim() || input.nome?.trim();
  const ativo = input.ativo;

  if (
    !ids.length &&
    !cpf &&
    !q &&
    !(idOuCpf && !isEntityUuid(idOuCpf)) &&
    ativo === undefined
  ) {
    return null;
  }

  return {
    ...(ids.length ? { ids: [...new Set(ids)] } : {}),
    ...(cpf ? { cpf } : {}),
    ...(q ? { q } : {}),
    ...(!q && idOuCpf && !isEntityUuid(idOuCpf) ? { q: idOuCpf } : {}),
    ...(ativo !== undefined ? { ativo } : {}),
  };
}

export function veiculosScopeFromFilter(input: {
  ids?: string[];
  veiculoId?: string;
  placa?: string;
  ativo?: boolean;
}): VeiculosSqlFilter | null {
  const ids = [...new Set((input.ids ?? []).filter((id) => isEntityUuid(id.trim())).map((id) => id.trim()))];
  const veiculoId = input.veiculoId?.trim();
  if (veiculoId && isEntityUuid(veiculoId)) ids.push(veiculoId);
  const placa = input.placa?.trim();
  const ativo = input.ativo;

  if (!ids.length && !placa && ativo === undefined) return null;

  return {
    ...(ids.length ? { ids: [...new Set(ids)] } : {}),
    ...(placa ? { placa } : {}),
    ...(ativo !== undefined ? { ativo } : {}),
  };
}
