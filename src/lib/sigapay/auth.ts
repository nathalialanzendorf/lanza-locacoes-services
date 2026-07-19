/**
 * Autenticação e headers HTTP para o portal/app SigaPay (Zona Azul Brasil).
 *
 * Override (debug): capturar sessão no DevTools → `SIGAPAY_COOKIE` + `SIGAPAY_TOKEN`
 * (Bearer ou header customizado conforme o endpoint capturado).
 */
import { loadLocalEnv } from "../loadLocalEnv.js";

loadLocalEnv();

if (process.env.SIGAPAY_TLS_INSECURE === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export const SIGAPAY_ORIGIN = (
  process.env.SIGAPAY_ORIGIN?.trim() || "https://sigapay.com.br"
).replace(/\/$/, "");

/** Base da API — configure após capturar no DevTools (Network). */
export const SIGAPAY_API_BASE = (
  process.env.SIGAPAY_API_BASE?.trim() || `${SIGAPAY_ORIGIN}/api`
).replace(/\/$/, "");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export type SigapaySession = { cookie?: string; token?: string };

let sessionCache: SigapaySession | null = null;

export function sigapayUserAgent(): string {
  return process.env.SIGAPAY_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

export function clearSigapaySession(): void {
  sessionCache = null;
}

function sessionFromEnv(): SigapaySession | null {
  const cookie = process.env.SIGAPAY_COOKIE?.trim();
  const token = process.env.SIGAPAY_TOKEN?.trim();
  if (cookie || token) return { cookie, token };
  return null;
}

/** Obtém sessão (env > cache). */
export async function getSigapaySession(): Promise<SigapaySession | null> {
  const env = sessionFromEnv();
  if (env) return env;
  return sessionCache;
}

/** Headers JSON para chamadas à API SigaPay. */
export async function sigapayJsonHeaders(referer?: string): Promise<Record<string, string>> {
  const session = await getSigapaySession();
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    origin: SIGAPAY_ORIGIN,
    referer: referer ?? `${SIGAPAY_ORIGIN}/`,
    "user-agent": sigapayUserAgent(),
  };
  if (session?.cookie) headers.cookie = session.cookie;
  if (session?.token) {
    headers.authorization = session.token.startsWith("Bearer ")
      ? session.token
      : `Bearer ${session.token}`;
  }
  const extra = process.env.SIGAPAY_EXTRA_HEADERS?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Record<string, string>;
      Object.assign(headers, parsed);
    } catch {
      // ignora JSON inválido
    }
  }
  return headers;
}
