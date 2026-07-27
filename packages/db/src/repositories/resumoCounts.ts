import { pgQuery } from "../client/PostgresPool.js";

/** Contrato em locação ativa (status ativo, sem encerramento). */
const CONTRATO_ATIVO_SQL = `
  c.status = 'ativo'
  AND (c.data_encerramento IS NULL OR btrim(c.data_encerramento) = '')
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
  infracoes_em_aberto: number;
  infracoes_notificadas: number;
  infracoes_debito: number;
  infracoes_sem_responsavel: number;
};

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
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
              AND (
                c.veiculo_id = v.id
                OR lower(regexp_replace(c.placa, '[^a-zA-Z0-9]', '', 'g')) = v.placa_norm
              )
          )
      ) AS veiculos_locados,

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
