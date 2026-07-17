import type { ApiError } from "./types";
import { getStoredToken } from "./authClient";

const STORAGE_KEY = "lanza_api_key";

const PRODUCTION_API_URL = "https://api.lanzalocacoes.vercel.app";

function isLanzaFrontendHost(hostname: string): boolean {
  return (
    hostname === "lanzalocacoes.vercel.app" ||
    /^lanzalocacoes[\w-]*\.vercel\.app$/.test(hostname)
  );
}

export function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (import.meta.env.PROD && typeof window !== "undefined") {
    if (isLanzaFrontendHost(window.location.hostname)) {
      return PRODUCTION_API_URL;
    }
  }
  return "";
}

function baseUrl(): string {
  return getApiBaseUrl();
}

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? import.meta.env.VITE_API_KEY ?? "";
}

export function setStoredApiKey(key: string): void {
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export class LanzaApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LanzaApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl()}${normalized}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const apiKey = getStoredApiKey().trim();
  if (apiKey) headers["X-API-Key"] = apiKey;

  const token = getStoredToken().trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(buildUrl(path, options.params), init);
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!res.ok) {
    const message =
      (payload as ApiError | null)?.error ?? `Erro HTTP ${res.status}`;
    throw new LanzaApiError(res.status, message);
  }

  return payload as T;
}
