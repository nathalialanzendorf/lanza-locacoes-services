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

export function corsOrigin(): string {
  return process.env.LANZA_API_CORS_ORIGIN ?? "*";
}
