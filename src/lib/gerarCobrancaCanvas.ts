/**
 * Gera .canvas.tsx a partir do sidecar JSON e copia para ~/.cursor/projects/…/canvases/.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./repoRoot.js";

const GEN_SCRIPT = path.join(REPO_ROOT, "scripts", "gen-cobranca-canvas.mjs");

function slugCliente(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Sidecar JSON → `canvases/cobranca[-simples]-{slug}.canvas.tsx`. */
export function canvasPathFromSidecarJson(jsonPath: string): string {
  const base = path.basename(jsonPath, ".json");
  const slug = base.replace(/-\d{2}-\d{2}-\d{4}$/, "");
  return path.join(REPO_ROOT, "canvases", `${slug}.canvas.tsx`);
}

/** Remove canvases antigos `cobranca-*-{cliente}.canvas.tsx` ao regenerar por cliente. */
function removerCanvasesObsoletosCliente(
  novoCanvasPath: string,
  clienteNome: string,
): void {
  const clienteSlug = slugCliente(clienteNome);
  const novoNome = path.basename(novoCanvasPath);
  const padraoLegado = new RegExp(
    `^cobranca-.+-${clienteSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.canvas\\.tsx$`,
  );

  const dirs = [
    path.join(REPO_ROOT, "canvases"),
    cursorProjectCanvasesDir(),
  ].filter((d): d is string => d != null);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const nome of fs.readdirSync(dir)) {
      if (nome === novoNome) continue;
      if (padraoLegado.test(nome)) {
        try {
          fs.unlinkSync(path.join(dir, nome));
        } catch {
          /* best-effort */
        }
      }
    }
  }
}

function cursorProjectCanvasesDir(): string | null {
  const override = process.env.CURSOR_PROJECT_CANVASES_DIR?.trim();
  if (override) return path.resolve(override);
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const normalized = path.resolve(REPO_ROOT);
  const win = /^([a-zA-Z]):[\\/](.*)$/.exec(normalized);
  const projectSlug = win
    ? `${win[1].toLowerCase()}-${win[2].replace(/\\/g, "-").replace(/\//g, "-")}`
    : normalized.replace(/^\//, "").replace(/\//g, "-");
  return path.join(home, ".cursor", "projects", projectSlug, "canvases");
}

export type GerarCobrancaCanvasResult = {
  repoPath: string;
  cursorPath: string | null;
};

/** Invoca scripts/gen-cobranca-canvas.mjs (grava no repo + copia para o Cursor IDE). */
export function gerarCobrancaCanvasDeSidecar(jsonPath: string): GerarCobrancaCanvasResult {
  const canvasPath = canvasPathFromSidecarJson(jsonPath);
  const absJson = path.resolve(jsonPath);

  let sidecar: { tipo?: string; cliente?: string } | null = null;
  try {
    sidecar = JSON.parse(fs.readFileSync(absJson, "utf8")) as {
      tipo?: string;
      cliente?: string;
    };
  } catch {
    sidecar = null;
  }

  const r = spawnSync("node", [GEN_SCRIPT, absJson, canvasPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(err || `gen-cobranca-canvas.mjs falhou (código ${r.status})`);
  }

  if (sidecar?.tipo === "cobranca" && sidecar.cliente?.trim()) {
    removerCanvasesObsoletosCliente(canvasPath, sidecar.cliente);
  }

  const lines = (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  return {
    repoPath: lines[0] ?? canvasPath,
    cursorPath: lines[1] ?? null,
  };
}
