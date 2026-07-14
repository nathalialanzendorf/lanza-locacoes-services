/// <reference path="./ambient.d.ts" />
import {
  createVercelPostgresPool,
  getDbBackend,
  setVercelPostgresPool,
} from "@lanza/db";
import { createApp, logStartup } from "./app.js";
import { apiHost, apiPort } from "./config.js";

if (process.env.VERCEL && getDbBackend() !== "file") {
  setVercelPostgresPool(createVercelPostgresPool());
}

const port = apiPort();
const host = apiHost();
const server = createApp();

server.listen(port, host, () => {
  logStartup(port, host);
});
