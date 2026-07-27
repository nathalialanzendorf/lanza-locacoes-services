import crypto from "node:crypto";

import {
  assertRelationalStore,
  deleteVendaFromSql,
  obterVendaFromSql,
  queryVendasFromSql,
  upsertVendaToSql,
  useRelationalStore,
} from "@lanza/db";
import { tipoFrotaDeVeiculo, TipoVeiculoFrota } from "./domain/tipoVeiculoFrota.js";
import { loadClientesDbAsync } from "./clientesDb.js";
import { formatPlacaHyphen } from "./placa.js";
import {
  findVeiculoInDb,
  loadVeiculosDbAsync,
  type VeiculoRegistro,
} from "./veiculosDb.js";

export type VendaRegistro = {
  id: string;
  veiculoId: string | null;
  placa: string;
  clienteId: string | null;
  compradorNome: string | null;
  dataVenda: string;
  valorVenda: number;
  valorEntrada: number | null;
  dataPagamentoParcelas: string | null;
  valorParcela: number | null;
  quantidadeParcelas: number | null;
  formaPagamento: string | null;
  observacao: string | null;
  ativo: boolean;
  cadastradoEm?: string;
  atualizadoEm?: string;
};

export type VendaInput = {
  id?: string;
  veiculoId?: string | null;
  placa?: string;
  clienteId?: string | null;
  compradorNome?: string | null;
  dataVenda: string;
  valorVenda: number | string;
  valorEntrada?: number | string | null;
  dataPagamentoParcelas?: string | null;
  valorParcela?: number | string | null;
  quantidadeParcelas?: number | string | null;
  formaPagamento?: string | null;
  observacao?: string | null;
  ativo?: boolean;
};

export type ListarVendasOpts = {
  veiculoId?: string;
  clienteId?: string;
  placa?: string;
  ativo?: boolean;
  dataInicial?: string;
  dataFinal?: string;
};

function parseValor(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).replace(/R\$\s*/i, "").trim();
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseIntPositivo(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function mapRow(row: Record<string, unknown>): VendaRegistro {
  return {
    id: String(row.id),
    veiculoId: row.veiculoId != null ? String(row.veiculoId) : null,
    placa: String(row.placa ?? ""),
    clienteId: row.clienteId != null ? String(row.clienteId) : null,
    compradorNome: row.compradorNome != null ? String(row.compradorNome) : null,
    dataVenda: String(row.dataVenda ?? ""),
    valorVenda: Number(row.valorVenda),
    valorEntrada: row.valorEntrada != null ? Number(row.valorEntrada) : null,
    dataPagamentoParcelas:
      row.dataPagamentoParcelas != null ? String(row.dataPagamentoParcelas) : null,
    valorParcela: row.valorParcela != null ? Number(row.valorParcela) : null,
    quantidadeParcelas:
      row.quantidadeParcelas != null ? Number(row.quantidadeParcelas) : null,
    formaPagamento: row.formaPagamento != null ? String(row.formaPagamento) : null,
    observacao: row.observacao != null ? String(row.observacao) : null,
    ativo: row.ativo !== false,
    cadastradoEm: row.cadastradoEm != null ? String(row.cadastradoEm) : undefined,
    atualizadoEm: row.atualizadoEm != null ? String(row.atualizadoEm) : undefined,
  };
}

async function resolverComprador(
  clienteId?: string | null,
  compradorNome?: string | null,
): Promise<{ clienteId: string | null; compradorNome: string | null }> {
  const cid = clienteId?.trim() || null;
  if (cid) {
    const db = await loadClientesDbAsync();
    const c = db.clientes.find((x) => x.id === cid);
    return { clienteId: cid, compradorNome: c?.nome?.trim() ?? compradorNome?.trim() ?? null };
  }
  return { clienteId: null, compradorNome: compradorNome?.trim() || null };
}

async function obterVeiculoRef(ref: string): Promise<VeiculoRegistro | null> {
  const key = ref.trim();
  if (!key) return null;
  const scoped = await loadVeiculosDbAsync(
    key.length >= 32 ? { veiculoId: key } : { placa: key },
  );
  return findVeiculoInDb(scoped, key);
}

async function resolverVeiculoVenda(
  veiculoId?: string | null,
  placa?: string | null,
): Promise<{ veiculoId: string | null; placa: string }> {
  const ref = veiculoId?.trim() || placa?.trim() || "";
  if (!ref) throw new Error("Veículo é obrigatório");

  let veiculo = await obterVeiculoRef(veiculoId?.trim() || "");
  if (!veiculo && placa?.trim()) {
    veiculo = await obterVeiculoRef(placa.trim());
  }
  if (!veiculo) {
    return { veiculoId: null, placa: formatPlacaHyphen(placa ?? ref) };
  }
  if (tipoFrotaDeVeiculo(veiculo) !== TipoVeiculoFrota.Venda) {
    throw new Error("Veículo selecionado não pertence ao estoque de venda");
  }
  return {
    veiculoId: veiculo.id,
    placa: veiculo.placa,
  };
}

export async function listarVendasAsync(opts: ListarVendasOpts = {}): Promise<VendaRegistro[]> {
  if (!(await useRelationalStore())) {
    assertRelationalStore();
  }
  const rows = await queryVendasFromSql(opts);
  return rows.map((r) => mapRow(r));
}

export async function obterVendaAsync(id: string): Promise<VendaRegistro | null> {
  if (!(await useRelationalStore())) {
    assertRelationalStore();
  }
  const row = await obterVendaFromSql(id);
  return row ? mapRow(row) : null;
}

export async function gravarVendaAsync(input: VendaInput): Promise<VendaRegistro> {
  if (!(await useRelationalStore())) {
    assertRelationalStore();
  }

  const valorVenda = parseValor(input.valorVenda);
  if (valorVenda == null) throw new Error("Valor da venda inválido");

  const dataVenda = input.dataVenda?.trim();
  if (!dataVenda) throw new Error("Data da venda é obrigatória");

  const veiculo = await resolverVeiculoVenda(input.veiculoId, input.placa);
  const comprador = await resolverComprador(input.clienteId, input.compradorNome);

  const registro: VendaRegistro = {
    id: input.id?.trim() || crypto.randomUUID(),
    veiculoId: veiculo.veiculoId,
    placa: veiculo.placa,
    clienteId: comprador.clienteId,
    compradorNome: comprador.compradorNome,
    dataVenda,
    valorVenda,
    valorEntrada: parseValor(input.valorEntrada),
    dataPagamentoParcelas: input.dataPagamentoParcelas?.trim() || null,
    valorParcela: parseValor(input.valorParcela),
    quantidadeParcelas: parseIntPositivo(input.quantidadeParcelas),
    formaPagamento: input.formaPagamento?.trim() || null,
    observacao: input.observacao?.trim() || null,
    ativo: input.ativo !== false,
    cadastradoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };

  await upsertVendaToSql(registro as unknown as Record<string, unknown>);
  return (await obterVendaAsync(registro.id)) ?? registro;
}

export async function excluirVendaAsync(id: string): Promise<VendaRegistro | null> {
  if (!(await useRelationalStore())) {
    assertRelationalStore();
  }
  const atual = await obterVendaAsync(id);
  if (!atual) return null;
  await deleteVendaFromSql(id);
  return atual;
}
