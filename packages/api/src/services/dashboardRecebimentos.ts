import {
  loadCobrancasDbContextForResumoAsync,
  loadCobrancasDbContextSync,
  obterDashboardRecebimentos,
  obterDashboardRecebimentosTotais,
  type DashboardRecebimentos,
  type DashboardRecebimentosListaResponse,
  type DashboardRecebimentosTotaisResponse,
} from "../lib-imports.js";

const RECEBIMENTOS_VAZIO: DashboardRecebimentos = {
  dataReferenciaBr: "—",
  tituloPagamentoSemanal: "Pagamento semanal",
  totais: { semanal: 0, caucao: 0, renegociacao: 0 },
};

const TOTAIS_VAZIO: DashboardRecebimentosTotaisResponse = {
  dataReferenciaBr: RECEBIMENTOS_VAZIO.dataReferenciaBr,
  tituloPagamentoSemanal: RECEBIMENTOS_VAZIO.tituloPagamentoSemanal,
  totais: RECEBIMENTOS_VAZIO.totais,
};

let recebimentosCache: { at: number; data: DashboardRecebimentos } | null = null;
const RECEBIMENTOS_CACHE_MS = 20_000;

async function carregarDashboardRecebimentos(): Promise<DashboardRecebimentos> {
  const ctx = await loadCobrancasDbContextForResumoAsync();
  return obterDashboardRecebimentos(ctx);
}

/** Totais nominal — semanal, caução e renegociação em aberto. */
export async function obterDashboardRecebimentosApiAsync(): Promise<DashboardRecebimentos> {
  if (process.env.VERCEL && recebimentosCache && Date.now() - recebimentosCache.at < RECEBIMENTOS_CACHE_MS) {
    return recebimentosCache.data;
  }
  try {
    const data = await carregarDashboardRecebimentos();
    if (process.env.VERCEL) recebimentosCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[dashboard/recebimentos] falha:", err);
    return RECEBIMENTOS_VAZIO;
  }
}

/** @deprecated Preferir obterDashboardRecebimentosApiAsync */
export async function obterDashboardRecebimentosTotaisApiAsync(): Promise<DashboardRecebimentosTotaisResponse> {
  try {
    const data = await carregarDashboardRecebimentos();
    return {
      dataReferenciaBr: data.dataReferenciaBr,
      tituloPagamentoSemanal: data.tituloPagamentoSemanal,
      totais: data.totais,
    };
  } catch (err) {
    console.error("[dashboard/recebimentos/totais] falha:", err);
    return TOTAIS_VAZIO;
  }
}

/** @deprecated Listagem em atraso/vence hoje via GET /api/despesas no dashboard */
export async function listarDashboardRecebimentosAtrasadosApiAsync(): Promise<DashboardRecebimentosListaResponse> {
  try {
    const data = await carregarDashboardRecebimentos();
    return {
      dataReferenciaBr: data.dataReferenciaBr,
      tituloPagamentoSemanal: data.tituloPagamentoSemanal,
      items: [],
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
