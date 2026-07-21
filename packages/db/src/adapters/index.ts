import path from "node:path";

import type { DbBackend, JsonDocumentAdapter } from "./types.js";
import { FileJsonDocumentAdapter } from "./file.js";
import { PostgresJsonDocumentAdapter } from "./postgres.js";
import { DualJsonDocumentAdapter } from "./dual.js";

let cachedBackend: DbBackend | null = null;
let cachedAdapter: JsonDocumentAdapter | null = null;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v != null && v.trim() !== "" ? v.trim().toLowerCase() : undefined;
}

function postgresConfigured(): boolean {
  const hasHost = Boolean(env("PGHOST") ?? process.env.DATABASE_URL?.trim());
  const hasAuth = Boolean(
    env("PGPASSWORD") ??
      process.env.PGPASSWORD?.trim() ??
      env("AWS_ROLE_ARN") ??
      process.env.AWS_ROLE_ARN?.trim(),
  );
  return hasHost && hasAuth;
}

function resolveDbBackend(): DbBackend {
  const raw = env("LANZA_DB_BACKEND");
  if (raw === "postgres" || raw === "dual" || raw === "file") return raw;
  // Com RDS configurado: postgres por defeito (fonte da verdade relacional)
  if (postgresConfigured()) return "postgres";
  return "file";
}

/** Backend ativo: `file` (padrão), `postgres` ou `dual`. */
export function getDbBackend(): DbBackend {
  // Vercel/Lambda: não cachear — env pode mudar entre deploys e instâncias quentes
  // podem ter resolvido "file" antes das variáveis Postgres estarem activas.
  if (process.env.VERCEL) return resolveDbBackend();
  if (cachedBackend) return cachedBackend;
  cachedBackend = resolveDbBackend();
  return cachedBackend;
}

export function createJsonDocumentAdapter(backend: DbBackend = getDbBackend()): JsonDocumentAdapter {
  switch (backend) {
    case "postgres":
      return new PostgresJsonDocumentAdapter();
    case "dual":
      return new DualJsonDocumentAdapter();
    default:
      return new FileJsonDocumentAdapter();
  }
}

export function getJsonDocumentAdapter(): JsonDocumentAdapter {
  if (process.env.VERCEL) return createJsonDocumentAdapter();
  if (!cachedAdapter) {
    cachedAdapter = createJsonDocumentAdapter();
  }
  return cachedAdapter;
}

/** Nome do store a partir do caminho `database/foo-bar.json` → `foo-bar`. */
export function storeNameFromPath(filePath: string): string {
  return path.basename(filePath, ".json");
}

/** Limpa cache (útil em testes). */
export function resetJsonDocumentAdapterCache(): void {
  cachedBackend = null;
  cachedAdapter = null;
}

export type { DbBackend, JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";
export { FileJsonDocumentAdapter } from "./file.js";
export { PostgresJsonDocumentAdapter } from "./postgres.js";
export { DualJsonDocumentAdapter } from "./dual.js";
