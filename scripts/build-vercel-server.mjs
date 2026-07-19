#!/usr/bin/env node
/**
 * Bundle server.ts para a Vercel (Node não executa @lanza/db → src/index.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
const outfile = path.join(outDir, "server.mjs");

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "server.ts")],
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
console.log(`[build:vercel] OK — ${path.relative(root, outfile)} (~${kb} KiB)`);
