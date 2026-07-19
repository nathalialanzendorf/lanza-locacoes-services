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
import { warmupOcrWorker } from "../../../src/lib/documentoOcr.js";

async function bootstrapPostgres(): Promise<void> {
  if (!process.env.VERCEL || getDbBackend() === "file") return;
  try {
    setVercelPostgresPool(createVercelPostgresPool());
    await runSchemaMigration(false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lanza] bootstrap Postgres (Vercel) — API sobe em modo degradado:", msg);
  }
}

const port = apiPort();
const host = apiHost();

await bootstrapPostgres();

warmupOcrWorker();

const server = createApp();

server.listen(port, host, () => {
  logStartup(port, host);
});

export default server;
