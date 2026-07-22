import {
  findContratoInDb,
  intervaloBrIntersectaPeriodo,
  loadContratosDb,
  loadContratosDbAsync,
  loadVeiculosDbAsync,
  resolveVeiculoIdListagem,
  type ContratoRegistro,
} from "../lib-imports.js";
import { queryContratosFromSql, resolveVeiculoIdFromSql, useRelationalStore } from "@lanza/db";

export type ListarContratosOpts = {
  status?: "ativo" | "encerrado";
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  dataInicial?: string;
  dataFinal?: string;
};

function normPlacaQuery(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function terminoContratoBr(c: ContratoRegistro): string | null {
  return c.dataEncerramento?.trim() || c.dataFimPrevista?.trim() || null;
}

function filtrarContratos(
  items: ContratoRegistro[],
  opts: ListarContratosOpts,
): ContratoRegistro[] {
  let filtered = items;

  if (opts.status) {
    filtered = filtered.filter((c) => c.status === opts.status);
  }
  if (opts.clienteId?.trim()) {
    const id = opts.clienteId.trim();
    filtered = filtered.filter((c) => c.clienteId === id);
  }
  if (opts.veiculoId?.trim()) {
    const id = opts.veiculoId.trim();
    filtered = filtered.filter((c) => c.veiculoId === id);
  }
  if (opts.placa?.trim()) {
    const p = normPlacaQuery(opts.placa);
    filtered = filtered.filter((c) => normPlacaQuery(c.placa) === p);
  }
  if (opts.dataInicial?.trim() || opts.dataFinal?.trim()) {
    filtered = filtered.filter((c) =>
      intervaloBrIntersectaPeriodo(c.dataInicio, terminoContratoBr(c), {
        dataInicial: opts.dataInicial,
        dataFinal: opts.dataFinal,
      }),
    );
  }

  return filtered;
}

export function listarContratos(opts: ListarContratosOpts = {}): {
  total: number;
  items: ContratoRegistro[];
} {
  const items = filtrarContratos(loadContratosDb().contratos, opts);
  return { total: items.length, items };
}

export async function listarContratosAsync(opts: ListarContratosOpts = {}): Promise<{
  total: number;
  items: ContratoRegistro[];
}> {
  if (await useRelationalStore()) {
    const veiculoId =
      opts.veiculoId?.trim() ||
      (opts.placa?.trim()
        ? ((await resolveVeiculoIdFromSql({ placa: opts.placa })) ?? undefined)
        : undefined);
    let items = (await queryContratosFromSql({
      status: opts.status,
      clienteId: opts.clienteId,
      veiculoId,
    })) as ContratoRegistro[];
    items = filtrarContratos(items, {
      dataInicial: opts.dataInicial,
      dataFinal: opts.dataFinal,
    });
    return { total: items.length, items };
  }

  const db = await loadContratosDbAsync();
  const items = filtrarContratos(db.contratos, opts);
  return { total: items.length, items };
}

export function obterContrato(id: string): ContratoRegistro | null {
  return findContratoInDb(loadContratosDb(), id);
}

export async function obterContratoAsync(id: string): Promise<ContratoRegistro | null> {
  if (await useRelationalStore()) {
    const items = (await queryContratosFromSql({ id: id.trim() })) as ContratoRegistro[];
    return items[0] ?? null;
  }
  const db = await loadContratosDbAsync();
  return findContratoInDb(db, id);
}
