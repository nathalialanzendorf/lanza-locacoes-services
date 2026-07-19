/// <reference path="./ambient.d.ts" />
/** Entrypoint serverless @lanza/api (Vercel) — resumo/dashboard via Postgres. */
import { createServer, type Server } from "node:http";

import {
  createVercelPostgresPool,
  getDbBackend,
  runSchemaMigration,
  setVercelPostgresPool,
} from "@lanza/db";
import { createApp, logStartup } from "./app.js";
import { apiHost, apiPort } from "./config.js";
import { json } from "./http.js";

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

function buildServer(): Server {
  try {
    return createApp();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[lanza] createApp falhou:", err);
    return createServer((_req, res) => {
      json(res, 500, {
        error: "API não iniciou",
        detail,
        hint: "Ver logs Vercel (FUNCTION_INVOCATION_FAILED)",
      });
    });
  }
}

const server = buildServer();

server.listen(port, host, () => {
  logStartup(port, host);
  void bootstrapPostgres();
  warmupOcrLocal();
});

export default server;
