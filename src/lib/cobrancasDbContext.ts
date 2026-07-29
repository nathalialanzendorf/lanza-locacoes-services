import {
  loadClientesByIdsFromSql,
  logFlowStep,
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
import { CategoriaDespesaCliente } from "./domain/index.js";

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
  /** Só despesas em aberto (baixa / recebimentos). */
  emAberto?: boolean;
  /** Contrato do par cliente+veículo (AND) em vez de OR — baixa unitária. */
  contratoPar?: boolean;
  /** Despesas abertas do veículo; atribuição ao cliente fica em memória. */
  despesasPorVeiculo?: boolean;
  /** clienteId + veiculoId + despesaId — contexto mínimo (POST recebimentos/plano). */
  planoUnitario?: boolean;
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

export async function loadCobrancasDbContextForResumoAsync(): Promise<CobrancasDbContext> {
  const [clienteDespesasDb, clientesDb, veiculosDb, contratosDb] = await Promise.all([
    loadClienteDespesasDbAsync({ emAberto: true, ativo: true }),
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
  flowRoute = "cobrancas/scoped",
): Promise<CobrancasDbContext> {
  logFlowStep(flowRoute, 1, "useRelationalStore");
  if (!(await useRelationalStore())) {
    logFlowStep(flowRoute, 2, "fallback loadCobrancasDbContextAsync (JSON)");
    return loadCobrancasDbContextAsync();
  }

  const despesaAlvoRef = input.despesaId?.trim() || null;

  let clienteId = input.clienteId?.trim() && isEntityUuid(input.clienteId.trim()) ? input.clienteId.trim() : null;
  if (!clienteId && input.clienteQuery?.trim()) {
    logFlowStep(flowRoute, 2, "resolveClienteIdFromSql");
    clienteId = await resolveClienteIdFromSql({
      clienteQuery: input.clienteQuery,
    });
  }

  let veiculoId =
    input.veiculoId?.trim() && isEntityUuid(input.veiculoId.trim()) ? input.veiculoId.trim() : null;
  if (!veiculoId && input.placa?.trim()) {
    logFlowStep(flowRoute, 3, "resolveVeiculoIdFromSql");
    veiculoId = await resolveVeiculoIdFromSql({ placa: input.placa });
  }

  let rowAlvoPrefetch: Record<string, unknown> | null = null;
  if (!clienteId && !veiculoId && despesaAlvoRef) {
    logFlowStep(flowRoute, 4, "queryClienteDespesaByReferenciaFromSql (prefetch)");
    rowAlvoPrefetch = await queryClienteDespesaByReferenciaFromSql(despesaAlvoRef);
    if (rowAlvoPrefetch) {
      const condutorId = String(rowAlvoPrefetch.condutor_id ?? "").trim();
      if (isEntityUuid(condutorId)) clienteId = condutorId;
      const vid = String(rowAlvoPrefetch.veiculo_id ?? "").trim();
      if (isEntityUuid(vid)) veiculoId = vid;
    }
  }

  if (!clienteId && !veiculoId) {
    logFlowStep(flowRoute, 5, "sem escopo — erro (sem full scan)");
    throw new Error(
      "Não foi possível resolver cliente ou veículo. Informe clienteId (UUID), veiculoId, despesaId ou refine clienteQuery/placa.",
    );
  }

  const contratoQueryOpts = {
    ...(clienteId ? { clienteId } : {}),
    ...(veiculoId ? { veiculoIds: [veiculoId] } : {}),
    ...(input.contratoPar === true && clienteId && veiculoId ? { contratoPar: true as const } : {}),
    ...(input.planoUnitario === true || input.contratoPar === true ? { skipSnapshots: true as const } : {}),
  };

  if (
    input.planoUnitario === true &&
    despesaAlvoRef &&
    clienteId &&
    veiculoId
  ) {
    logFlowStep(flowRoute, 6, "plano unitário — contexto mínimo");
    const [rowAlvo, clientes, veiculos, contratos, semanalAtrasado, pagasRecentes] =
      await Promise.all([
        queryClienteDespesaByReferenciaFromSql(despesaAlvoRef),
        loadClientesByIdsFromSql([clienteId]),
        queryVeiculosByIdsFromSql([veiculoId]),
        queryContratosFromSql(contratoQueryOpts),
        queryClienteDespesasFromSql({
          ativo: true,
          emAberto: true,
          veiculoId,
          categoria: CategoriaDespesaCliente.LocacaoSemanal,
          descricaoIlike: "ATRASADO",
        }),
        queryClienteDespesasFromSql({
          ativo: true,
          emAberto: false,
          clienteId,
          veiculoId,
          limit: 20,
        }),
      ]);

    let clienteDespesas = mergeDespesaRows(semanalAtrasado, rowAlvo);
    for (const row of pagasRecentes) {
      clienteDespesas = mergeDespesaRows(clienteDespesas, row);
    }

    logFlowStep(
      flowRoute,
      8,
      `plano unitário pronto (despesas=${clienteDespesas.length} contratos=${contratos.length})`,
    );

    return {
      clienteDespesas,
      clientes: clientes as ClienteRegistro[],
      veiculos: veiculos as VeiculoRegistro[],
      contratos: contratos as ContratoRegistro[],
    };
  }

  const sqlFilter = {
    ativo: true as const,
    ...(input.emAberto === true ? { emAberto: true as const } : {}),
    ...(input.despesasPorVeiculo === true && veiculoId
      ? { veiculoId }
      : {
          ...(clienteId ? { clienteId } : {}),
          ...(veiculoId ? { veiculoId } : {}),
        }),
  };

  logFlowStep(flowRoute, 6, "queryClienteDespesasFromSql + despesa alvo");
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

  logFlowStep(
    flowRoute,
    7,
    `loadClientes/veiculos/contratos (clientes=${clienteIds.length} veiculos=${veiculoIds.length})`,
  );
  const [clientes, veiculos, contratos] = await Promise.all([
    clienteIds.length > 0 ? loadClientesByIdsFromSql(clienteIds) : Promise.resolve([]),
    veiculoIds.length > 0 ? queryVeiculosByIdsFromSql(veiculoIds) : Promise.resolve([]),
    queryContratosFromSql({
      ...(clienteId ? { clienteId } : {}),
      ...(veiculoIds.length > 0 ? { veiculoIds } : {}),
      ...(input.contratoPar === true && clienteId && veiculoIds.length === 1
        ? { contratoPar: true }
        : {}),
      ...(input.planoUnitario === true || input.contratoPar === true ? { skipSnapshots: true } : {}),
    }),
  ]);

  logFlowStep(
    flowRoute,
    8,
    `contexto pronto (despesas=${clienteDespesas.length} contratos=${contratos.length})`,
  );

  return {
    clienteDespesas,
    clientes: clientes as ClienteRegistro[],
    veiculos: veiculos as VeiculoRegistro[],
    contratos: contratos as ContratoRegistro[],
  };
}

export const loadBaixaPlanoDbContextAsync = loadCobrancasScopedDbContextAsync;
