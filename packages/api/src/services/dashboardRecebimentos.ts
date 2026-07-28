import {
  clienteExibicaoPorId,
  loadClientesDbAsync,
  loadCobrancasDbContextForResumoAsync,
  loadCobrancasDbContextSync,
  obterDashboardRecebimentos,
  obterDashboardRecebimentosTotais,
  type DashboardRecebimentoLinha,
  type DashboardRecebimentos,
  type DashboardRecebimentosListaResponse,
  type DashboardRecebimentosTotaisResponse,
} from "../lib-imports.js";

const RECEBIMENTOS_VAZIO: DashboardRecebimentos = {
  dataReferenciaBr: "—",
  tituloPagamentoSemanal: "Pagamento semanal",
  venceHoje: [],
  atrasados: [],
  totais: { venceHoje: 0, atrasado: 0, semanal: 0, caucao: 0, renegociacao: 0 },
};

const TOTAIS_VAZIO: DashboardRecebimentosTotaisResponse = {
  dataReferenciaBr: RECEBIMENTOS_VAZIO.dataReferenciaBr,
  tituloPagamentoSemanal: RECEBIMENTOS_VAZIO.tituloPagamentoSemanal,
  totais: RECEBIMENTOS_VAZIO.totais,
  contagens: { venceHoje: 0, atrasados: 0 },
  venceHoje: [],
};

function enriquecerLinhas(
  linhas: DashboardRecebimentoLinha[],
  clientes: Awaited<ReturnType<typeof loadClientesDbAsync>>["clientes"],
): DashboardRecebimentoLinha[] {
  return linhas.map((l) => ({
    ...l,
    clienteNome: clienteExibicaoPorId(clientes, l.clienteId, l.clienteNome),
  }));
}

async function carregarDashboardRecebimentosEnriquecido(): Promise<DashboardRecebimentos> {
  const [ctx, clientesDb] = await Promise.all([
    loadCobrancasDbContextForResumoAsync(),
    loadClientesDbAsync(),
  ]);
  const data = obterDashboardRecebimentos(ctx);
  return {
    ...data,
    venceHoje: enriquecerLinhas(data.venceHoje, clientesDb.clientes),
    atrasados: enriquecerLinhas(data.atrasados, clientesDb.clientes),
  };
}

/** Payload completo — vence hoje, atrasados e totais numa única consulta. */
export async function obterDashboardRecebimentosApiAsync(): Promise<DashboardRecebimentos> {
  try {
    return await carregarDashboardRecebimentosEnriquecido();
  } catch (err) {
    console.error("[dashboard/recebimentos] falha:", err);
    return RECEBIMENTOS_VAZIO;
  }
}

/** @deprecated Preferir obterDashboardRecebimentosApiAsync */
export async function obterDashboardRecebimentosTotaisApiAsync(): Promise<DashboardRecebimentosTotaisResponse> {
  try {
    const data = await carregarDashboardRecebimentosEnriquecido();
    return {
      dataReferenciaBr: data.dataReferenciaBr,
      tituloPagamentoSemanal: data.tituloPagamentoSemanal,
      totais: data.totais,
      contagens: {
        venceHoje: data.venceHoje.length,
        atrasados: data.atrasados.length,
      },
      venceHoje: data.venceHoje,
    };
  } catch (err) {
    console.error("[dashboard/recebimentos/totais] falha:", err);
    return TOTAIS_VAZIO;
  }
}

/** @deprecated Preferir obterDashboardRecebimentosApiAsync */
export async function listarDashboardRecebimentosAtrasadosApiAsync(): Promise<DashboardRecebimentosListaResponse> {
  try {
    const data = await carregarDashboardRecebimentosEnriquecido();
    return {
      dataReferenciaBr: data.dataReferenciaBr,
      tituloPagamentoSemanal: data.tituloPagamentoSemanal,
      items: data.atrasados,
    };
  } catch (err) {
    console.error("[dashboard/recebimentos/atrasados] falha:", err);
    return { dataReferenciaBr: "—", items: [] };
  }
}

/** Caminho síncrono (JSON local). */
export function obterDashboardRecebimentosTotaisApi(): DashboardRecebimentosTotaisResponse {
  try {
    const ctx = loadCobrancasDbContextSync();
    const meta = obterDashboardRecebimentosTotais(ctx);
    return meta;
  } catch (err) {
    console.error("[dashboard/recebimentos/totais] falha:", err);
    return TOTAIS_VAZIO;
  }
}
