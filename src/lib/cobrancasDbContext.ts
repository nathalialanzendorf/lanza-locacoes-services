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

export type BaixaPlanoDbContextInput = {
  clienteQuery?: string | null;
  autoInfracaoAlvo?: string | null;
};

function resolveClienteIdFromQuery(query: string, clientes: ClienteRegistro[]): string | null {
  const q = query.trim();
  if (!q) return null;

  const byId = clientes.find((c) => c.id === q);
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

/** Contexto enxuto para montar plano de baixa (evita carregar todas as despesas no Postgres). */
export async function loadBaixaPlanoDbContextAsync(
  input: BaixaPlanoDbContextInput = {},
): Promise<CobrancasDbContext> {
  if (!(await useRelationalStore())) {
    return loadCobrancasDbContextAsync();
  }

  const [clientesDb, veiculosDb, contratosDb] = await Promise.all([
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadContratosDbAsync(),
  ]);

  const clienteId = input.clienteQuery?.trim()
    ? resolveClienteIdFromQuery(input.clienteQuery, clientesDb.clientes)
    : null;

  if (!clienteId) {
    return loadCobrancasDbContextAsync();
  }

  const [rowsCliente, rowAlvo] = await Promise.all([
    queryClienteDespesasFromSql({ clienteId, ativo: true }),
    input.autoInfracaoAlvo?.trim()
      ? queryClienteDespesaByReferenciaFromSql(input.autoInfracaoAlvo)
      : Promise.resolve(null),
  ]);

  return {
    clienteDespesas: mergeDespesaRows(rowsCliente, rowAlvo),
    clientes: clientesDb.clientes,
    veiculos: veiculosDb.veiculos,
    contratos: contratosDb.contratos,
  };
}
