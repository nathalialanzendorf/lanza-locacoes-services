import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cobrancaCanvasDados } from "./lib/cobrancaCanvasDados.mjs";
import { cobrancaSimplesCanvasDados } from "./lib/cobrancaSimplesCanvasDados.mjs";
import {
  relatorioInfracoesCanvasDados,
  relatorioInfracoesResumidoCanvasDados,
} from "./lib/relatorioInfracoesCanvasDados.mjs";
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
  console.error("Uso: node scripts/gen-cobranca-canvas.mjs <cobranca.json> <out.canvas.tsx>");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

function resolveCanvas(j, outPath) {
  if (j.tipo === "relatorio-infracoes") {
    return {
      layout: "relatorio-infracoes",
      componentName: "RelatorioInfracoes",
      dados: relatorioInfracoesCanvasDados(j),
    };
  }
  if (j.tipo === "relatorio-infracoes-resumido") {
    return {
      layout: "relatorio-infracoes-resumido",
      componentName: "RelatorioInfracoesResumido",
      dados: relatorioInfracoesResumidoCanvasDados(j),
    };
  }
  const simples = j.tipo === "cobranca-simples";
  const slug = path.basename(outPath, ".canvas.tsx").replace(/^cobranca(-simples)?-/, "");
  return {
    layout: simples ? "cobranca-simples" : "cobranca",
    componentName: componentNameFromSlug(simples ? "CobrancaSimples" : "Cobranca", slug),
    dados: simples ? cobrancaSimplesCanvasDados(j) : cobrancaCanvasDados(j),
  };
}

const { layout, componentName, dados } = resolveCanvas(j, outPath);
const out = renderCanvasLayout(layout, {
  dados,
  componentName,
});

writeCanvas(outPath, out);
const cursorPath = copyCanvasToCursorIde(REPO_ROOT, outPath);
console.log(outPath);
if (cursorPath) console.log(cursorPath);
