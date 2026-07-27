import {
  clienteExibicaoPorId,
  loadClientesDbAsync,
  loadCobrancasDbContextForResumoAsync,
  loadCobrancasDbContextSync,
  listarDashboardRecebimentosAtrasados,
  obterDashboardRecebimentosTotais,
  type DashboardRecebimentoLinha,
  type DashboardRecebimentosListaResponse,
  type DashboardRecebimentosTotaisResponse,
} from "../lib-imports.js";

const TOTAIS_VAZIO: DashboardRecebimentosTotaisResponse = {
  dataReferenciaBr: "—",
  tituloPagamentoSemanal: "Pagamento semanal",
  totais: { venceHoje: 0, atrasado: 0, semanal: 0, caucao: 0, renegociacao: 0 },
  contagens: { venceHoje: 0, atrasados: 0 },
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

export async function obterDashboardRecebimentosTotaisApiAsync(): Promise<DashboardRecebimentosTotaisResponse> {
  try {
    const ctx = await loadCobrancasDbContextForResumoAsync();
    return obterDashboardRecebimentosTotais(ctx);
  } catch (err) {
    console.error("[dashboard/recebimentos/totais] falha:", err);
    return TOTAIS_VAZIO;
  }
}

export async function listarDashboardRecebimentosAtrasadosApiAsync(): Promise<DashboardRecebimentosListaResponse> {
  try {
    const [ctx, clientesDb] = await Promise.all([
      loadCobrancasDbContextForResumoAsync(),
      loadClientesDbAsync(),
    ]);
    const meta = obterDashboardRecebimentosTotais(ctx);
    return {
      dataReferenciaBr: meta.dataReferenciaBr,
      items: enriquecerLinhas(listarDashboardRecebimentosAtrasados(ctx), clientesDb.clientes),
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
    return obterDashboardRecebimentosTotais(ctx);
  } catch (err) {
    console.error("[dashboard/recebimentos/totais] falha:", err);
    return TOTAIS_VAZIO;
  }
}
