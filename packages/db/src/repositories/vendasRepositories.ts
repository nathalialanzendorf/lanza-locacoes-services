import { randomUUID } from "node:crypto";

import { pgQuery } from "../client/PostgresPool.js";
import { pgWriteQuery } from "../client/pgWrite.js";
import { resolveVeiculoIdFromSql } from "./coreRepositories.js";
import {
  asBool,
  asNumber,
  asText,
  formatPlacaHyphen,
  isUuid,
  parseIso,
} from "../migration/relationalUtils.js";

export type VendaRow = Record<string, unknown>;

export type VendasSqlFilter = {
  veiculoId?: string;
  clienteId?: string;
  placa?: string;
  ativo?: boolean;
  dataInicial?: string;
  dataFinal?: string;
};

function rowIso(v: unknown): string | undefined {
  if (v == null) return undefined;
  return String(v);
}

function mapVendaRow(row: Record<string, unknown>): VendaRow {
  return {
    id: String(row.id),
    veiculoId: row.veiculo_id ?? null,
    placa: row.placa,
    clienteId: row.cliente_id ?? null,
    compradorNome: row.comprador_nome ?? null,
    dataVenda: row.data_venda,
    valorVenda: row.valor_venda != null ? Number(row.valor_venda) : null,
    valorEntrada: row.valor_entrada != null ? Number(row.valor_entrada) : null,
    dataPagamentoParcelas: row.data_pagamento_parcelas ?? null,
    valorParcela: row.valor_parcela != null ? Number(row.valor_parcela) : null,
    quantidadeParcelas:
      row.quantidade_parcelas != null ? Number(row.quantidade_parcelas) : null,
    formaPagamento: row.forma_pagamento ?? null,
    observacao: row.observacao ?? null,
    ativo: row.ativo !== false,
    cadastradoEm: rowIso(row.cadastrado_em),
    atualizadoEm: rowIso(row.atualizado_em),
  };
}

export async function queryVendasFromSql(filter: VendasSqlFilter = {}): Promise<VendaRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  let p = 1;

  if (filter.veiculoId?.trim() && isUuid(filter.veiculoId.trim())) {
    params.push(filter.veiculoId.trim());
    where.push(`v.veiculo_id::text = $${p++}`);
  }

  if (filter.clienteId?.trim() && isUuid(filter.clienteId.trim())) {
    params.push(filter.clienteId.trim());
    where.push(`v.cliente_id::text = $${p++}`);
  }

  if (filter.placa?.trim()) {
    const veiculoId = await resolveVeiculoIdFromSql({ placa: filter.placa.trim() });
    if (veiculoId) {
      params.push(veiculoId);
      where.push(`v.veiculo_id::text = $${p++}`);
    }
  }

  if (filter.ativo === true) {
    where.push(`v.ativo IS TRUE`);
  } else if (filter.ativo === false) {
    where.push(`v.ativo IS FALSE`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const r = await pgQuery(
    `SELECT v.* FROM lanza.vendas v ${whereSql} ORDER BY v.data_venda DESC, v.cadastrado_em DESC`,
    params,
    "queryVendasFromSql",
  );
  let items = r.rows.map((row) => mapVendaRow(row as Record<string, unknown>));

  const dataInicial = filter.dataInicial?.trim();
  const dataFinal = filter.dataFinal?.trim();
  if (dataInicial || dataFinal) {
    items = items.filter((item) => {
      const d = String(item.dataVenda ?? "");
      if (dataInicial && d < dataInicial) return false;
      if (dataFinal && d > dataFinal) return false;
      return true;
    });
  }

  return items;
}

export async function obterVendaFromSql(id: string): Promise<VendaRow | null> {
  if (!isUuid(id.trim())) return null;
  const r = await pgQuery(
    `SELECT v.* FROM lanza.vendas v WHERE v.id::text = $1 LIMIT 1`,
    [id.trim()],
    "obterVendaFromSql",
  );
  const row = r.rows[0];
  return row ? mapVendaRow(row as Record<string, unknown>) : null;
}

export async function upsertVendaToSql(v: Record<string, unknown>): Promise<void> {
  const id = asText(v.id) ?? randomUUID();
  const veiculoIdRaw = asText(v.veiculoId);
  let veiculoId: string | null = null;
  if (veiculoIdRaw && isUuid(veiculoIdRaw)) {
    veiculoId = veiculoIdRaw;
  } else if (asText(v.placa)) {
    veiculoId = await resolveVeiculoIdFromSql({ placa: asText(v.placa)! });
  }

  const placa = formatPlacaHyphen(asText(v.placa) ?? "");
  const valorVenda = asNumber(v.valorVenda);
  if (valorVenda == null || !Number.isFinite(valorVenda)) {
    throw new Error('Campo "valorVenda" é obrigatório');
  }
  const dataVenda = asText(v.dataVenda)?.trim();
  if (!dataVenda) {
    throw new Error('Campo "dataVenda" é obrigatório');
  }

  await pgWriteQuery(
    `INSERT INTO lanza.vendas (
      id, veiculo_id, placa, cliente_id, comprador_nome, data_venda,
      valor_venda, valor_entrada, data_pagamento_parcelas, valor_parcela, quantidade_parcelas,
      forma_pagamento, observacao, ativo,
      cadastrado_em, atualizado_em
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15::timestamptz, now()), now())
    ON CONFLICT (id) DO UPDATE SET
      veiculo_id = EXCLUDED.veiculo_id,
      placa = EXCLUDED.placa,
      cliente_id = EXCLUDED.cliente_id,
      comprador_nome = EXCLUDED.comprador_nome,
      data_venda = EXCLUDED.data_venda,
      valor_venda = EXCLUDED.valor_venda,
      valor_entrada = EXCLUDED.valor_entrada,
      data_pagamento_parcelas = EXCLUDED.data_pagamento_parcelas,
      valor_parcela = EXCLUDED.valor_parcela,
      quantidade_parcelas = EXCLUDED.quantidade_parcelas,
      forma_pagamento = EXCLUDED.forma_pagamento,
      observacao = EXCLUDED.observacao,
      ativo = EXCLUDED.ativo,
      atualizado_em = now()`,
    [
      id,
      veiculoId,
      placa,
      isUuid(asText(v.clienteId)) ? v.clienteId : null,
      asText(v.compradorNome),
      dataVenda,
      valorVenda,
      v.valorEntrada != null ? asNumber(v.valorEntrada) : null,
      asText(v.dataPagamentoParcelas),
      v.valorParcela != null ? asNumber(v.valorParcela) : null,
      v.quantidadeParcelas != null ? asNumber(v.quantidadeParcelas) : null,
      asText(v.formaPagamento),
      asText(v.observacao),
      asBool(v.ativo, true),
      parseIso(asText(v.cadastradoEm)),
    ],
  );
}

export async function deleteVendaFromSql(id: string): Promise<boolean> {
  const r = await pgWriteQuery(`DELETE FROM lanza.vendas WHERE id = $1`, [id.trim()]);
  return (r.rowCount ?? 0) > 0;
}
