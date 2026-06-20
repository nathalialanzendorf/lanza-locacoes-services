import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repoRoot.js";

export function readLanzaPaths(): Record<string, string> {
  const cfg = path.join(REPO_ROOT, "config", "lanza_paths.json");
  if (!fs.existsSync(cfg)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfg, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

export function defaultContratosDir(): string {
  const p = readLanzaPaths();
  return (
    p.contratosDir ||
    p.documentosRaiz ||
    path.join(REPO_ROOT, "contratos")
  );
}

export function prestacaoContasBaseDir(): string {
  const p = readLanzaPaths();
  const fin = p.financeiro;
  if (fin) {
    const sub = p.prestacaoContasSubpasta || "prestação de contas";
    return path.join(fin, sub);
  }
  return path.join(REPO_ROOT, "prestação de contas");
}
