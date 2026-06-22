/**
 * API /keek/rest/gasto — Gastos Gerais (recebimentos, etc.).
 * A listagem usa parâmetros típicos Spring Data; se falhar, ajustar query
 * conforme o XHR capturado no DevTools na UI de gastos.
 */
import { RASTREAME_ORIGIN, rastreameJsonHeaders } from "./auth.js";

const GASTO_ROOT = `${RASTREAME_ORIGIN}/keek/rest/gasto`;

export type ListGastosParams = {
  page?: number;
  size?: number;
};

/** GET lista paginada (resposta JSON crua). */
export async function fetchGastosList(
  params: ListGastosParams = {},
): Promise<Response> {
  const page = params.page ?? 0;
  const size = params.size ?? 50;
  const q = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  const url = `${GASTO_ROOT}?${q.toString()}`;
  return fetch(url, {
    method: "GET",
    headers: await rastreameJsonHeaders(false),
  });
}

/** POST cria gasto; corpo = objeto serializado em JSON. */
export async function postGasto(body: unknown): Promise<Response> {
  return fetch(`${GASTO_ROOT}/`, {
    method: "POST",
    headers: await rastreameJsonHeaders(true),
    body: JSON.stringify(body),
  });
}

/** PUT atualiza gasto existente. */
export async function putGasto(id: string | number, body: unknown): Promise<Response> {
  return fetch(`${GASTO_ROOT}/${id}`, {
    method: "PUT",
    headers: await rastreameJsonHeaders(true),
    body: JSON.stringify(body),
  });
}
