import {
  queryClienteDespesaByReferenciaFromSql,
  queryClienteDespesasFromSql,
  useRelationalStore,
} from "@lanza/db";
import { loadClienteDespesasDb, loadClienteDespesasDbAsync, type ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { loadClientesDb, loadClientesDbAsync, type ClienteRegistro } from "./clientesDb.js";
import { loadContratosDb, loadContratosDbAsync, type ContratoRegistro } from "./contratosDb.js";
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

function resolveClienteIdFromQuery(query: string, clientes: ClienteRegistro[]): string | null {
  const q = query.trim();
  if (!q) return null;

  const qLower = q.toLowerCase();
  const byId = clientes.find((c) => c.id?.toLowerCase() === qLower);
  if (byId?.id) return byId.id;

  const key = q.replace(/\D/g, "");
  if (key.length === 11) {
    const byCpf = clientes.find((c) => c.cpf?.replace(/\D/g, "") === key);
    if (byCpf?.id) return byCpf.id;
  }

  return null;
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

/** Contexto enxuto por cliente/placa (Postgres) — baixa, relatório de cobranças, etc. */
export async function loadCobrancasScopedDbContextAsync(
  input: CobrancasScopedContextInput = {},
): Promise<CobrancasDbContext> {
  if (!(await useRelationalStore())) {
    return loadCobrancasDbContextAsync();
  }

  const [clientesDb, veiculosDb, contratosDb] = await Promise.all([
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadContratosDbAsync(),
  ]);

  const clienteId =
    input.clienteId?.trim() ||
    (input.clienteQuery?.trim()
      ? resolveClienteIdFromQuery(input.clienteQuery, clientesDb.clientes)
      : null);
  const veiculoId = input.veiculoId?.trim() || null;
  const placa = input.placa?.trim() || null;
  const despesaAlvoRef = input.despesaId?.trim() || null;

  if (!clienteId && !veiculoId && !placa) {
    if (despesaAlvoRef) {
      const rowAlvo = await queryClienteDespesaByReferenciaFromSql(despesaAlvoRef);
      if (rowAlvo) {
        const condutorId = String(rowAlvo.condutor_id ?? "").trim() || null;
        const rows = condutorId
          ? await queryClienteDespesasFromSql({ clienteId: condutorId, ativo: true })
          : [];
        return {
          clienteDespesas: mergeDespesaRows(rows, rowAlvo),
          clientes: clientesDb.clientes,
          veiculos: veiculosDb.veiculos,
          contratos: contratosDb.contratos,
        };
      }
    }
    return loadCobrancasDbContextAsync();
  }

  const sqlFilter = {
    ativo: true as const,
    ...(clienteId ? { clienteId } : {}),
    ...(veiculoId ? { veiculoId } : placa ? { placa } : {}),
  };
  const rowsPromise = queryClienteDespesasFromSql(sqlFilter);

  const [rows, rowAlvo] = await Promise.all([
    rowsPromise,
    despesaAlvoRef
      ? queryClienteDespesaByReferenciaFromSql(despesaAlvoRef)
      : Promise.resolve(null),
  ]);

  return {
    clienteDespesas: mergeDespesaRows(rows, rowAlvo),
    clientes: clientesDb.clientes,
    veiculos: veiculosDb.veiculos,
    contratos: contratosDb.contratos,
  };
}

export const loadBaixaPlanoDbContextAsync = loadCobrancasScopedDbContextAsync;
