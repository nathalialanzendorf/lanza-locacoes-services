#!/usr/bin/env node
/**
 * Bundle da API para a Vercel:
 * - server.mjs — handler pesado (import dinâmico a partir de api/index.mjs)
 * - api/index.mjs — entry leve (commitado, não bundlado)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "packages/api/src/handler.ts");
const outfile = path.join(root, "server.mjs");

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  packages: "external",
  alias: {
    "@lanza/db": path.join(root, "packages/db/src/index.ts"),
    "@lanza/storage": path.join(root, "packages/storage/src/index.ts"),
  },
  logLevel: "info",
});

const kb = Math.round(fs.statSync(outfile).size / 1024);
console.log(`[build:vercel] OK — server.mjs (~${kb} KiB) + api/index.mjs (entry leve)`);
