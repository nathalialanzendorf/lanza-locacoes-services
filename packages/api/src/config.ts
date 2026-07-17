export const API_VERSION = "0.1.0";

export function apiPort(): number {
  const raw = process.env.PORT ?? process.env.LANZA_API_PORT ?? "3100";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3100;
}

export function apiHost(): string {
  if (process.env.LANZA_API_HOST) return process.env.LANZA_API_HOST;
  if (process.env.VERCEL || process.env.PORT) return "0.0.0.0";
  return "127.0.0.1";
}

export function apiKey(): string | null {
  const key = process.env.LANZA_API_KEY?.trim();
  return key || null;
}

const DEFAULT_FRONTEND_ORIGINS = [
  "https://lanzalocacoes.vercel.app",
  "https://lanza-web-ten.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/** Origens permitidas (lista ou `*`). */
export function corsOrigins(): string[] {
  const raw = process.env.LANZA_API_CORS_ORIGIN?.trim();
  if (!raw) {
    const web = process.env.LANZA_WEB_URL?.trim();
    const origins = [...DEFAULT_FRONTEND_ORIGINS];
    if (web && !origins.includes(web)) origins.push(web);
    return origins;
  }
  if (raw === "*") return ["*"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Compat: primeira origem da lista (legado). */
export function corsOrigin(): string {
  const origins = corsOrigins();
  return origins[0] ?? "*";
}

export function resolveCorsOrigin(requestOrigin: string | undefined): string | null {
  const allowed = corsOrigins();
  if (allowed.includes("*")) return "*";
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  if (
    requestOrigin &&
    /^https:\/\/(lanzalocacoes|lanza-web)[\w-]*\.vercel\.app$/.test(requestOrigin)
  ) {
    return requestOrigin;
  }
  return allowed[0] ?? null;
}

export function apiPublicUrl(): string | undefined {
  const fromEnv = process.env.LANZA_API_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.VERCEL) return "https://api.lanzalocacoes.vercel.app";
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return undefined;
}

export function jwtSecret(): string | null {
  const secret = process.env.LANZA_JWT_SECRET?.trim();
  return secret || null;
}

/** Duração do token JWT (ex.: 7d, 24h, 3600). Default: 7 dias. */
export function jwtExpiresIn(): string {
  return process.env.LANZA_JWT_EXPIRES_IN?.trim() || "7d";
}

/** Permite registo público mesmo com utilizadores existentes. */
export function allowPublicRegister(): boolean {
  const raw = process.env.LANZA_ALLOW_REGISTER?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "sim";
}

/** Autenticação obrigatória (JWT ou API key). */
export function authRequired(): boolean {
  return Boolean(jwtSecret() || apiKey());
}
