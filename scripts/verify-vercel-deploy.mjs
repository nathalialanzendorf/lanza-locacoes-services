#!/usr/bin/env node
/**
 * Simula o que a Vercel valida antes do deploy (@vercel/backends):
 * - ficheiros referenciados pelo entrypoint não podem estar no .vercelignore
 * - bundle do entrypoint resolve todos os imports locais
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "packages/api/src/index.ts");

function loadIgnorePatterns() {
  const file = path.join(root, ".vercelignore");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/** Subconjunto de regras gitignore usado pelo .vercelignore. */
function isIgnored(relPosix, patterns) {
  const p = relPosix.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const raw of patterns) {
    const anchored = raw.startsWith("/");
    const pattern = anchored ? raw.slice(1) : raw;
    if (!pattern) continue;

    if (anchored) {
      if (p === pattern || p.startsWith(`${pattern}/`)) return true;
      continue;
    }

    if (p === pattern || p.startsWith(`${pattern}/`)) return true;
    if (p.includes(`/${pattern}/`) || p.endsWith(`/${pattern}`)) return true;
  }
  return false;
}

async function main() {
  for (const script of ["typecheck:storage", "typecheck:api"]) {
    console.log(`[verify:vercel] npm run ${script} ...`);
    const tsc = spawnSync("npm", ["run", script], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    if (tsc.status !== 0) {
      console.error(`[verify:vercel] FALHA — ${script}`);
      process.exit(tsc.status ?? 1);
    }
  }

  const patterns = loadIgnorePatterns();
  console.log("[verify:vercel] entry:", path.relative(root, entry));
  console.log("[verify:vercel] .vercelignore:", patterns.join(", ") || "(vazio)");

  let result;
  try {
    result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      alias: {
        "@lanza/db": path.join(root, "packages/db/src/index.ts"),
        "@lanza/storage": path.join(root, "packages/storage/src/index.ts"),
      },
      write: false,
      metafile: true,
      logLevel: "silent",
    });
  } catch (err) {
    console.error("[verify:vercel] FALHA bundle (imports não resolvidos):");
    console.error(err.message ?? err);
    process.exit(1);
  }

  const inputs = Object.keys(result.metafile.inputs).sort();
  const ignoredInputs = [];
  for (const abs of inputs) {
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (isIgnored(rel, patterns)) ignoredInputs.push(rel);
  }

  if (ignoredInputs.length > 0) {
    console.error("[verify:vercel] FALHA — .vercelignore exclui código necessário:");
    for (const f of ignoredInputs) console.error(`  - ${f}`);
    console.error(
      "\nDica: padrões como 'relatorios' ignoram packages/api/src/services/relatorios/.",
    );
    console.error("Use '/relatorios' para ignorar só a pasta na raiz do repo.");
    process.exit(1);
  }

  const kb = Math.round(result.outputFiles[0].contents.length / 1024);
  console.log(`[verify:vercel] OK — ${inputs.length} ficheiros no grafo, bundle ~${kb} KiB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
