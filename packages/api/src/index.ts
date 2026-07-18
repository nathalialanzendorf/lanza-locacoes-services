/// <reference path="./ambient.d.ts" />
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
  setVercelPostgresPool(createVercelPostgresPool());
  try {
    await runSchemaMigration(false);
  } catch (err) {
    console.error("[lanza] falha ao aplicar migrações SQL:", err);
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
