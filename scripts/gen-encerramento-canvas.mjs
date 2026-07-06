import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encerramentoCanvasDados } from "./lib/encerramentoCanvasDados.mjs";
import {
  componentNameFromSlug,
  copyCanvasToCursorIde,
  renderCanvasLayout,
  writeCanvas,
} from "./lib/renderCanvasLayout.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jsonPath = process.argv[2];
const outPath = process.argv[3];
if (!jsonPath || !outPath) {
  console.error(
    "Uso: node scripts/gen-encerramento-canvas.mjs <encerramento.json> <out.canvas.tsx>",
  );
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const dados = encerramentoCanvasDados(j);
const slug = path.basename(outPath, ".canvas.tsx").replace(/^encerramento-/, "");
const componentName = componentNameFromSlug("Encerramento", slug);
const out = renderCanvasLayout("encerramento", { dados, componentName });

writeCanvas(outPath, out);
const cursorPath = copyCanvasToCursorIde(REPO_ROOT, outPath);
console.log(outPath);
if (cursorPath) console.log(cursorPath);
