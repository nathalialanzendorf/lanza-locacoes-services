/// <reference path="./ambient.d.ts" />
/** Entrypoint serverless @lanza/api (Vercel) — resumo/dashboard via Postgres. */
import {
  createVercelPostgresPool,
  getDbBackend,
  runSchemaMigration,
  setVercelPostgresPool,
} from "@lanza/db";
import { createApp, logStartup } from "./app.js";
import { apiHost, apiPort } from "./config.js";

async function bootstrapPostgres(): Promise<void> {
  if (!process.env.VERCEL || getDbBackend() === "file") return;
  try {
    setVercelPostgresPool(createVercelPostgresPool());
    await runSchemaMigration(false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lanza] bootstrap Postgres (Vercel):", msg);
  }
}

function warmupOcrLocal(): void {
  if (process.env.VERCEL) return;
  void import("../../../src/lib/documentoOcr.js")
    .then((m) => m.warmupOcrWorker())
    .catch((err) => {
      console.warn("[lanza] OCR warmup ignorado:", err instanceof Error ? err.message : err);
    });
}

const port = apiPort();
const host = apiHost();
const server = createApp();

server.listen(port, host, () => {
  logStartup(port, host);
  void bootstrapPostgres();
  warmupOcrLocal();
});

export default server;
