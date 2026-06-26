/**
 * Autenticação e headers HTTP para servicos.detran.sc.gov.br / transito-api.
 */
import { loadLocalEnv } from "../loadLocalEnv.js";

loadLocalEnv();

export const DETRAN_SC_ORIGIN = "https://servicos.detran.sc.gov.br";
export const DETRAN_SC_API_BASE =
  "https://backend.detran.sc.gov.br/transito-api";

const DEFAULT_APP_VERSION = "2026-06-26-1612";

export function detranScAppVersion(): string {
  return process.env.DETRAN_SC_APP_VERSION?.trim() || DEFAULT_APP_VERSION;
}

export function requireDetranScAuth(): string {
  const t = process.env.DETRAN_SC_AUTH?.trim();
  if (!t) {
    console.error(
      "ERRO: defina DETRAN_SC_AUTH (Bearer JWT) no `.env` na raiz do repo (ver `.env.example`).",
    );
    console.error(
      "Obter em servicos.detran.sc.gov.br → DevTools → Network → pedido com Authorization.",
    );
    process.exit(2);
  }
  return t.startsWith("Bearer ") ? t.slice(7) : t;
}

export function requireDetranScEmpresa(): string {
  const e = process.env.DETRAN_SC_EMPRESA?.trim();
  if (!e) {
    console.error(
      "ERRO: defina DETRAN_SC_EMPRESA (header X-Empresa) no `.env` (ver `.env.example`).",
    );
    process.exit(2);
  }
  return e;
}

export function detranScJsonHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${requireDetranScAuth()}`,
    Origin: DETRAN_SC_ORIGIN,
    Referer: `${DETRAN_SC_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "X-App-Version": detranScAppVersion(),
    "X-Empresa": requireDetranScEmpresa(),
  };
}
