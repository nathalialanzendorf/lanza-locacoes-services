import {
  checkPagBankAuth,
  defaultDateRange,
  fetchAllCreditosPagBank,
  fetchCreditosPagBank,
  montarLotePagBank,
  pagBankAuthConfigured,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export async function statusPagBank() {
  if (!pagBankAuthConfigured()) {
    return { configurado: false, ok: false };
  }
  const r = await checkPagBankAuth();
  return { configurado: true, ok: r.ok, creditos: r.creditos };
}

export async function listarCreditosPagBank(opts: {
  inicio?: string;
  fim?: string;
  page?: number;
}) {
  if (!pagBankAuthConfigured()) {
    throw new HttpError(503, "PAGBANK_AUTH não configurado");
  }
  const def = defaultDateRange();
  const initialDate = opts.inicio ?? def.initialDate;
  const finalDate = opts.fim ?? def.finalDate;

  if (opts.page != null) {
    const { creditos, raw } = await fetchCreditosPagBank({
      initialDate,
      finalDate,
      page: opts.page,
    });
    return { intervalo: { initialDate, finalDate }, page: opts.page, creditos, raw };
  }

  const creditos = await fetchAllCreditosPagBank({ initialDate, finalDate });
  return { intervalo: { initialDate, finalDate }, total: creditos.length, creditos };
}

export async function matchPagBank(opts: { inicio?: string; fim?: string }) {
  if (!pagBankAuthConfigured()) {
    throw new HttpError(503, "PAGBANK_AUTH não configurado");
  }
  const def = defaultDateRange();
  const initialDate = opts.inicio ?? def.initialDate;
  const finalDate = opts.fim ?? def.finalDate;
  const creditos = await fetchAllCreditosPagBank({ initialDate, finalDate });
  const lote = montarLotePagBank(creditos, { initialDate, finalDate });
  return { ...lote, intervalo: { initialDate, finalDate } };
}
