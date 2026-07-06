/**
 * Gera .canvas.tsx a partir do sidecar JSON e copia para ~/.cursor/projects/…/canvases/.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { REPO_ROOT } from "./repoRoot.js";

const GEN_SCRIPT = path.join(REPO_ROOT, "scripts", "gen-cobranca-canvas.mjs");

/** Sidecar `cobranca-{slug}-{DD-MM-AAAA}.json` → `canvases/cobranca-{slug}.canvas.tsx`. */
export function canvasPathFromSidecarJson(jsonPath: string): string {
  const base = path.basename(jsonPath, ".json");
  const slug = base.replace(/-\d{2}-\d{2}-\d{4}$/, "");
  return path.join(REPO_ROOT, "canvases", `${slug}.canvas.tsx`);
}

export type GerarCobrancaCanvasResult = {
  repoPath: string;
  cursorPath: string | null;
};

/** Invoca scripts/gen-cobranca-canvas.mjs (grava no repo + copia para o Cursor IDE). */
export function gerarCobrancaCanvasDeSidecar(jsonPath: string): GerarCobrancaCanvasResult {
  const canvasPath = canvasPathFromSidecarJson(jsonPath);
  const absJson = path.resolve(jsonPath);

  const r = spawnSync("node", [GEN_SCRIPT, absJson, canvasPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(err || `gen-cobranca-canvas.mjs falhou (código ${r.status})`);
  }

  const lines = (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  return {
    repoPath: lines[0] ?? canvasPath,
    cursorPath: lines[1] ?? null,
  };
}
