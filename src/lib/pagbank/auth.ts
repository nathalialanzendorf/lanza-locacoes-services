/**
 * Autenticação e headers HTTP para api.ibanking.pagbank.com.br.
 * Credenciais via variáveis de ambiente do utilizador — nunca versionar tokens.
 */
import { loadLocalEnv } from "../loadLocalEnv.js";

loadLocalEnv();

/** Só diagnóstico TLS (ex.: antivírus/proxy). Preferir `PAGBANK_TLS_INSECURE=1` no `.env`. */
if (process.env.PAGBANK_TLS_INSECURE === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.warn(
    "[pagbank] PAGBANK_TLS_INSECURE=1 — verificação TLS desativada (apenas diagnóstico).",
  );
}

export const PAGBANK_ORIGIN = "https://minhaconta.pagbank.com.br";
export const PAGBANK_API = "https://api.ibanking.pagbank.com.br";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export function pagBankAuthConfigured(): boolean {
  return Boolean(process.env.PAGBANK_AUTH?.trim());
}

export function requirePagBankAuth(): string {
  const auth = process.env.PAGBANK_AUTH?.trim();
  if (!auth) {
    throw new Error(
      "Defina PAGBANK_AUTH nas variáveis de ambiente do utilizador (header authorization capturado no DevTools → Network ao listar extrato em minhaconta.pagbank.com.br). Opcional: PAGBANK_COOKIE para sessão completa. Ver .cursor/tools/pagbank/",
    );
  }
  return auth;
}

export function pagBankHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    authorization: requirePagBankAuth(),
    Origin: PAGBANK_ORIGIN,
    Referer: `${PAGBANK_ORIGIN}/`,
    "User-Agent": process.env.PAGBANK_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    "x-bank-statement-v2-flow": "true",
    "x-requested-with": "XMLHttpRequest",
  };
  const cookie = process.env.PAGBANK_COOKIE?.trim();
  if (cookie) h.Cookie = cookie;
  return h;
}

/** Verifica se a sessão responde (GET extrato, página 1, intervalo curto). */
export async function checkPagBankAuth(): Promise<{ ok: true; creditos: number }> {
  const fim = new Date();
  const ini = new Date(fim);
  ini.setDate(ini.getDate() - 7);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const q = new URLSearchParams({
    operationSign: "C",
    initialDate: fmt(ini),
    finalDate: fmt(fim),
    page: "1",
  });
  const url = `${PAGBANK_API}/checkingaccount/statements/list?${q.toString()}`;
  const r = await fetch(url, { method: "GET", headers: pagBankHeaders() });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`PagBank HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`PagBank resposta inválida: ${text.slice(0, 200)}`);
  }
  const count = Array.isArray(body)
    ? body.length
    : typeof body === "object" && body != null
      ? Object.keys(body as object).length
      : 0;
  return { ok: true, creditos: count };
}
