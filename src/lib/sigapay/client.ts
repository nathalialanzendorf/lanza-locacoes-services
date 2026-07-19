/**
 * HTTP de baixo nível para a API SigaPay (Zona Azul Brasil).
 */
import {
  clearSigapaySession,
  SIGAPAY_API_BASE,
  sigapayJsonHeaders,
} from "./auth.js";

/** Erro de autenticação (sessão expirada / credenciais inválidas). */
export class SigapayAuthError extends Error {
  status: number;
  constructor(status: number, detail = "") {
    super(
      `SigaPay sessão inválida (HTTP ${status}). Recapture SIGAPAY_COOKIE + SIGAPAY_TOKEN no DevTools (logado no portal/app).${detail ? ` ${detail}` : ""}`,
    );
    this.name = "SigapayAuthError";
    this.status = status;
  }
}

export type ApiFetchOpts = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  referer?: string;
};

function buildUrl(path: string, query?: ApiFetchOpts["query"]): string {
  const base = path.startsWith("http")
    ? path
    : `${SIGAPAY_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

async function doFetch(path: string, opts: ApiFetchOpts): Promise<Response> {
  const url = buildUrl(path, opts.query);
  const headers = await sigapayJsonHeaders(opts.referer);
  const hasBody = opts.body !== undefined;
  if (!hasBody) delete headers["Content-Type"];
  return fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
}

export async function apiFetchRaw(path: string, opts: ApiFetchOpts = {}): Promise<Response> {
  return doFetch(path, opts);
}

export async function apiFetchJson<T = unknown>(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<T> {
  const r = await apiFetchRaw(path, opts);
  const text = await r.text();
  if (r.status === 401 || r.status === 403) {
    clearSigapaySession();
    throw new SigapayAuthError(r.status);
  }
  if (!r.ok) {
    throw new Error(
      `SigaPay ${opts.method ?? "GET"} ${path} HTTP ${r.status}: ${text.slice(0, 300)}`,
    );
  }
  if (!text.trim()) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`SigaPay ${path}: resposta não-JSON: ${text.slice(0, 200)}`);
  }
}

/** Procura, recursivamente, o primeiro array dentro de um payload (ou chaves conhecidas). */
export function pickArray(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  for (const k of keys) {
    if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  for (const k of ["data", "result", "resultado", "items", "content", "payload", "itens"]) {
    const nested = o[k];
    if (Array.isArray(nested)) return nested as unknown[];
    if (nested && typeof nested === "object") {
      const found = pickArray(nested, keys);
      if (found.length) return found;
    }
  }
  return [];
}
