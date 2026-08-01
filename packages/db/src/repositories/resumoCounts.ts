import { pgQuery } from "../client/PostgresPool.js";

/** Contrato em locação ativa (status ativo, sem encerramento). */
const CONTRATO_ATIVO_SQL = `
  c.status = 'ativo'
  AND (c.data_encerramento IS NULL OR btrim(c.data_encerramento) = '')
`;

/** Dias até o fim previsto para marcar como “a vencer” (alinhado ao dashboard). */
const PROXIMO_VENCER_DIAS = 14;

/** Parse de data_fim_prevista (DD/MM/AAAA ou ISO) para date. */
const CONTRATO_FIM_PREVISTO_DATE_SQL = `
  CASE
    WHEN btrim(c.data_fim_prevista) ~ '^\\d{2}/\\d{2}/\\d{4}$'
      THEN to_date(btrim(c.data_fim_prevista), 'DD/MM/YYYY')
    WHEN btrim(c.data_fim_prevista) ~ '^\\d{4}-\\d{2}-\\d{2}$'
      THEN btrim(c.data_fim_prevista)::date
    ELSE NULL
  END
`;

/** Veículo ativo no cadastro da frota de locação (widget de frota). */
const VEICULO_FROTA_LOCACAO_SQL = `v.ativo IS TRUE AND v.tipo_frota = 'locacao'`;

/** Veículo ativo no cadastro (widget de frota). */
const VEICULO_ATIVO_SQL = `v.ativo IS TRUE`;

/** Infração ainda em aberto no DETRAN. */
const INFRACAO_ABERTA_SQL = `
  i.ativo IS NOT FALSE
  AND i.quitada_detran IS NOT TRUE
  AND COALESCE(i.situacao, '') !~* 'quitad|pago|paga'
  AND COALESCE(i.status, '') !~* 'quitad|pago|paga'
`;

export type ResumoCounts = {
  clientes: { total: number; ativos: number };
  veiculos: { total: number; ativos: number; locados: number; naoLocados: number };
  contratos: { total: number; ativos: number; vencidos: number; aVencer: number };
  despesasCliente: { emAberto: number; valorEmAberto: number };
  despesasParceiro: { emAberto: number; valorEmAberto: number };
  infracoes: {
    emAberto: number;
    notificadas: number;
    emAbertoDebito: number;
    semResponsavel: number;
    comVencimento: number;
    semCliente: number;
    semCondutor: number;
  };
};

type ResumoCountsRow = {
  clientes_total: number;
  clientes_ativos: number;
  veiculos_total: number;
  veiculos_ativos: number;
  veiculos_locados: number;
  contratos_total: number;
  contratos_ativos: number;
  contratos_vencidos: number;
  contratos_a_vencer: number;
  despesas_cliente_em_aberto: number;
  despesas_cliente_valor: number;
  despesas_parceiro_em_aberto: number;
  despesas_parceiro_valor: number;
  infracoes_em_aberto: number;
  infracoes_notificadas: number;
  infracoes_debito: number;
  infracoes_sem_responsavel: number;
};

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toMoney(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function mapRow(row: ResumoCountsRow): ResumoCounts {
  const veiculosAtivos = toInt(row.veiculos_ativos);
  const veiculosLocados = toInt(row.veiculos_locados);
  const infracoesDebito = toInt(row.infracoes_debito);
  const infracoesSemResp = toInt(row.infracoes_sem_responsavel);

  return {
    clientes: { total: toInt(row.clientes_total), ativos: toInt(row.clientes_ativos) },
    veiculos: {
      total: toInt(row.veiculos_total),
      ativos: veiculosAtivos,
      locados: veiculosLocados,
      naoLocados: Math.max(0, veiculosAtivos - veiculosLocados),
    },
    contratos: {
      total: toInt(row.contratos_total),
      ativos: toInt(row.contratos_ativos),
      vencidos: toInt(row.contratos_vencidos),
      aVencer: toInt(row.contratos_a_vencer),
    },
    despesasCliente: {
      emAberto: toInt(row.despesas_cliente_em_aberto),
      valorEmAberto: toMoney(row.despesas_cliente_valor),
    },
    despesasParceiro: {
      emAberto: toInt(row.despesas_parceiro_em_aberto),
      valorEmAberto: toMoney(row.despesas_parceiro_valor),
    },
    infracoes: {
      emAberto: toInt(row.infracoes_em_aberto),
      notificadas: toInt(row.infracoes_notificadas),
      emAbertoDebito: infracoesDebito,
      semResponsavel: infracoesSemResp,
      comVencimento: infracoesDebito,
      semCliente: infracoesSemResp,
      semCondutor: infracoesSemResp,
    },
  };
}

/** Contagens do dashboard — uma round-trip SQL, sem carregar catálogos. */
export async function queryResumoCountsFromSql(): Promise<ResumoCounts> {
  const r = await pgQuery<ResumoCountsRow>(
    `
    SELECT
      (SELECT COUNT(*)::int FROM lanza.clientes) AS clientes_total,
      (SELECT COUNT(*)::int FROM lanza.clientes WHERE ativo IS TRUE) AS clientes_ativos,

      (SELECT COUNT(*)::int FROM lanza.veiculos) AS veiculos_total,
      (SELECT COUNT(*)::int FROM lanza.veiculos v WHERE ${VEICULO_FROTA_LOCACAO_SQL}) AS veiculos_ativos,
      (
        SELECT COUNT(*)::int
        FROM lanza.veiculos v
        WHERE ${VEICULO_FROTA_LOCACAO_SQL}
          AND EXISTS (
            SELECT 1
            FROM lanza.contratos c
            WHERE ${CONTRATO_ATIVO_SQL}
              AND c.veiculo_id = v.id
          )
      ) AS veiculos_locados,

      (SELECT COUNT(*)::int FROM lanza.contratos) AS contratos_total,
      (
        SELECT COUNT(*)::int
        FROM lanza.contratos c
        WHERE ${CONTRATO_ATIVO_SQL}
      ) AS contratos_ativos,
      (
        SELECT COUNT(*)::int
        FROM lanza.contratos c
        WHERE ${CONTRATO_ATIVO_SQL}
          AND ${CONTRATO_FIM_PREVISTO_DATE_SQL} < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      ) AS contratos_vencidos,
      (
        SELECT COUNT(*)::int
        FROM lanza.contratos c
        WHERE ${CONTRATO_ATIVO_SQL}
          AND ${CONTRATO_FIM_PREVISTO_DATE_SQL} >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
          AND ${CONTRATO_FIM_PREVISTO_DATE_SQL}
            <= (now() AT TIME ZONE 'America/Sao_Paulo')::date + ${PROXIMO_VENCER_DIAS}
      ) AS contratos_a_vencer,

      (
        SELECT COUNT(*)::int
        FROM lanza.cliente_despesas cd
        WHERE (cd.ativo IS DISTINCT FROM false)
          AND (cd.paga IS NOT TRUE)
          AND COALESCE(cd.status_cobranca, 'em_aberto') <> 'baixado'
      ) AS despesas_cliente_em_aberto,
      (
        SELECT COALESCE(SUM(cd.valor_multa), 0)
        FROM lanza.cliente_despesas cd
        WHERE (cd.ativo IS DISTINCT FROM false)
          AND (cd.paga IS NOT TRUE)
          AND COALESCE(cd.status_cobranca, 'em_aberto') <> 'baixado'
      ) AS despesas_cliente_valor,
      (
        SELECT COUNT(*)::int
        FROM lanza.parceiro_despesas pd
        WHERE pd.baixa IS NULL OR btrim(pd.baixa) = ''
      ) AS despesas_parceiro_em_aberto,
      (
        SELECT COALESCE(SUM(pd.valor), 0)
        FROM lanza.parceiro_despesas pd
        WHERE pd.baixa IS NULL OR btrim(pd.baixa) = ''
      ) AS despesas_parceiro_valor,

      (
        SELECT COUNT(*)::int
        FROM lanza.infracoes i
        WHERE ${INFRACAO_ABERTA_SQL}
      ) AS infracoes_em_aberto,

      (
        SELECT COUNT(*)::int
        FROM lanza.infracoes i
        WHERE ${INFRACAO_ABERTA_SQL}
          AND i.convertida_em_debito IS NOT TRUE
          AND (i.data_vencimento_original IS NULL OR btrim(i.data_vencimento_original) = '')
      ) AS infracoes_notificadas,

      (
        SELECT COUNT(*)::int
        FROM lanza.infracoes i
        WHERE ${INFRACAO_ABERTA_SQL}
          AND (
            i.convertida_em_debito IS TRUE
            OR (i.data_vencimento_original IS NOT NULL AND btrim(i.data_vencimento_original) <> '')
          )
      ) AS infracoes_debito,

      (
        SELECT COUNT(*)::int
        FROM lanza.infracoes i
        WHERE ${INFRACAO_ABERTA_SQL}
          AND i.condutor_id IS NULL
      ) AS infracoes_sem_responsavel
    `,
    undefined,
    "queryResumoCountsFromSql",
  );

  const row = r.rows[0];
  if (!row) {
    throw new Error("queryResumoCountsFromSql: nenhuma linha retornada");
  }
  return mapRow(row);
}
