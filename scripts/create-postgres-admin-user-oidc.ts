/**
 * Bootstrap local: usa VERCEL_OIDC_TOKEN + createVercelPostgresPool antes de criar admin.
 * Uso: npx tsx scripts/create-postgres-admin-user-oidc.ts [--reset] ...
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { createVercelPostgresPool, setVercelPostgresPool } from "@lanza/db";

function loadVercelOidcToken(): void {
  if (process.env.VERCEL_OIDC_TOKEN?.trim()) return;

  const envLocal = resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocal)) {
    throw new Error("VERCEL_OIDC_TOKEN ausente e .env.local não encontrado.");
  }

  const content = readFileSync(envLocal, "utf8");
  const match = content.match(/^VERCEL_OIDC_TOKEN=(?:"([^"]+)"|'([^']+)'|(\S+))/m);
  const token = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!token?.trim()) {
    throw new Error("VERCEL_OIDC_TOKEN não encontrado em .env.local.");
  }
  process.env.VERCEL_OIDC_TOKEN = token.trim();
}

delete process.env.PGPASSWORD;
loadVercelOidcToken();
process.env.LANZA_DB_BACKEND = "postgres";

setVercelPostgresPool(createVercelPostgresPool());

await import("./create-postgres-admin-user.js");
