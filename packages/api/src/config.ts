export const API_VERSION = "0.1.0";

export function apiPort(): number {
  const raw = process.env.LANZA_API_PORT ?? "3100";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 3100;
}

export function apiHost(): string {
  return process.env.LANZA_API_HOST ?? "127.0.0.1";
}

export function apiKey(): string | null {
  const key = process.env.LANZA_API_KEY?.trim();
  return key || null;
}

export function corsOrigin(): string {
  return process.env.LANZA_API_CORS_ORIGIN ?? "*";
}
