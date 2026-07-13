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

/** Backend ativo: `file` (padrão), `postgres` ou `dual`. */
export function getDbBackend(): DbBackend {
  if (cachedBackend) return cachedBackend;
  const raw = env("LANZA_DB_BACKEND") ?? "file";
  if (raw === "postgres" || raw === "dual") {
    cachedBackend = raw;
    return raw;
  }
  cachedBackend = "file";
  return "file";
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
