import {
  loadClientesByIdsFromSql,
  queryClienteDespesaByReferenciaFromSql,
  queryClienteDespesasFromSql,
  queryContratosFromSql,
  queryVeiculosByIdsFromSql,
  resolveClienteIdFromSql,
  resolveVeiculoIdFromSql,
  useRelationalStore,
} from "@lanza/db";
import { loadClienteDespesasDb, loadClienteDespesasDbAsync, type ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { loadClientesDb, loadClientesDbAsync, type ClienteRegistro } from "./clientesDb.js";
import { loadContratosDb, loadContratosDbAsync, type ContratoRegistro } from "./contratosDb.js";
import { isEntityUuid } from "./filtroListagem.js";
import { loadVeiculosDb, loadVeiculosDbAsync, type VeiculoRegistro } from "./veiculosDb.js";

export type CobrancasDbContext = {
  clienteDespesas: ClienteDespesaRegistro[];
  clientes: ClienteRegistro[];
  veiculos: VeiculoRegistro[];
  contratos: ContratoRegistro[];
};

export type CobrancasScopedContextInput = {
  clienteId?: string | null;
  clienteQuery?: string | null;
  veiculoId?: string | null;
  despesaId?: string | null;
  /** @deprecated prefer veiculoId */
  placa?: string | null;
};

/** @deprecated use CobrancasScopedContextInput */
export type BaixaPlanoDbContextInput = CobrancasScopedContextInput;

let _runtimeCtx: CobrancasDbContext | null = null;

export function setCobrancasRuntimeCtx(ctx: CobrancasDbContext | null): void {
  _runtimeCtx = ctx;
}

export function getCobrancasRuntimeCtx(): CobrancasDbContext | null {
  return _runtimeCtx;
}

/** Evita load*Db síncrono (deadlock awaitSync) dentro de handlers async no Postgres. */
export function cobrancasRuntimeDespesas(): ClienteDespesaRegistro[] {
  return _runtimeCtx?.clienteDespesas ?? loadClienteDespesasDb().clienteDespesas;
}

export function cobrancasRuntimeContratos(): ContratoRegistro[] {
  return _runtimeCtx?.contratos ?? loadContratosDb().contratos;
}

export function cobrancasRuntimeVeiculos(): VeiculoRegistro[] {
  return _runtimeCtx?.veiculos ?? loadVeiculosDb().veiculos;
}

export function cobrancasRuntimeClientes(): ClienteRegistro[] {
  return _runtimeCtx?.clientes ?? loadClientesDb().clientes;
}

function mergeDespesaRows(
  base: Record<string, unknown>[],
  extra: Record<string, unknown> | null,
): ClienteDespesaRegistro[] {
  const rows = [...base];
  if (extra) {
    const id = String(extra.id ?? "");
    if (!rows.some((r) => String(r.id ?? "") === id)) {
      rows.push(extra);
    }
  }
  return rows as ClienteDespesaRegistro[];
}

function veiculoIdFromDespesaRow(row: ClienteDespesaRegistro | Record<string, unknown>): string | null {
  const raw = String(
    ("veiculoId" in row ? row.veiculoId : null) ??
      ("veiculo_id" in row ? row.veiculo_id : null) ??
      "",
  ).trim();
  return isEntityUuid(raw) ? raw : null;
}

function collectVeiculoIds(
  despesas: ClienteDespesaRegistro[],
  ...extras: Array<string | null | undefined>
): string[] {
  const ids = new Set<string>();
  for (const extra of extras) {
    const id = extra?.trim();
    if (id && isEntityUuid(id)) ids.add(id);
  }
  for (const d of despesas) {
    const id = veiculoIdFromDespesaRow(d);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function loadCobrancasDbContextSync(): CobrancasDbContext {
  return {
    clienteDespesas: loadClienteDespesasDb().clienteDespesas,
    clientes: loadClientesDb().clientes,
    veiculos: loadVeiculosDb().veiculos,
    contratos: loadContratosDb().contratos,
  };
}

export async function loadCobrancasDbContextAsync(): Promise<CobrancasDbContext> {
  const [clienteDespesasDb, clientesDb, veiculosDb, contratosDb] = await Promise.all([
    loadClienteDespesasDbAsync(),
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadContratosDbAsync(),
  ]);
  return {
    clienteDespesas: clienteDespesasDb.clienteDespesas,
    clientes: clientesDb.clientes,
    veiculos: veiculosDb.veiculos,
    contratos: contratosDb.contratos,
  };
}

/** Contexto enxuto por cliente/veículo (Postgres) — baixa, relatório de cobranças, etc. */
export async function loadCobrancasScopedDbContextAsync(
  input: CobrancasScopedContextInput = {},
): Promise<CobrancasDbContext> {
  if (!(await useRelationalStore())) {
    return loadCobrancasDbContextAsync();
  }

  const despesaAlvoRef = input.despesaId?.trim() || null;

  let clienteId = input.clienteId?.trim() && isEntityUuid(input.clienteId.trim()) ? input.clienteId.trim() : null;
  if (!clienteId && input.clienteQuery?.trim()) {
    clienteId = await resolveClienteIdFromSql({
      clienteQuery: input.clienteQuery,
    });
  }

  let veiculoId =
    input.veiculoId?.trim() && isEntityUuid(input.veiculoId.trim()) ? input.veiculoId.trim() : null;
  if (!veiculoId && input.placa?.trim()) {
    veiculoId = await resolveVeiculoIdFromSql({ placa: input.placa });
  }

  let rowAlvoPrefetch: Record<string, unknown> | null = null;
  if (!clienteId && !veiculoId && despesaAlvoRef) {
    rowAlvoPrefetch = await queryClienteDespesaByReferenciaFromSql(despesaAlvoRef);
    if (rowAlvoPrefetch) {
      const condutorId = String(rowAlvoPrefetch.condutor_id ?? "").trim();
      if (isEntityUuid(condutorId)) clienteId = condutorId;
      const vid = String(rowAlvoPrefetch.veiculo_id ?? "").trim();
      if (isEntityUuid(vid)) veiculoId = vid;
    }
  }

  if (!clienteId && !veiculoId) {
    return loadCobrancasDbContextAsync();
  }

  const sqlFilter = {
    ativo: true as const,
    ...(clienteId ? { clienteId } : {}),
    ...(veiculoId ? { veiculoId } : {}),
  };

  const [rows, rowAlvo] = await Promise.all([
    queryClienteDespesasFromSql(sqlFilter),
    rowAlvoPrefetch
      ? Promise.resolve(rowAlvoPrefetch)
      : despesaAlvoRef
        ? queryClienteDespesaByReferenciaFromSql(despesaAlvoRef)
        : Promise.resolve(null),
  ]);

  const clienteDespesas = mergeDespesaRows(rows, rowAlvo);

  if (!clienteId && rowAlvo) {
    const condutorId = String(rowAlvo.condutor_id ?? "").trim();
    if (isEntityUuid(condutorId)) clienteId = condutorId;
  }

  const veiculoIds = collectVeiculoIds(clienteDespesas, veiculoId);
  const clienteIds = clienteId ? [clienteId] : [];

  const [clientes, veiculos, contratos] = await Promise.all([
    clienteIds.length > 0 ? loadClientesByIdsFromSql(clienteIds) : Promise.resolve([]),
    veiculoIds.length > 0 ? queryVeiculosByIdsFromSql(veiculoIds) : Promise.resolve([]),
    queryContratosFromSql({
      ...(clienteId ? { clienteId } : {}),
      ...(veiculoIds.length > 0 ? { veiculoIds } : {}),
    }),
  ]);

  return {
    clienteDespesas,
    clientes: clientes as ClienteRegistro[],
    veiculos: veiculos as VeiculoRegistro[],
    contratos: contratos as ContratoRegistro[],
  };
}

export const loadBaixaPlanoDbContextAsync = loadCobrancasScopedDbContextAsync;
