/**
 * Carrega `REPO_ROOT/.env` em `process.env` (só chaves ainda não definidas).
 * Útil quando o terminal não herda variáveis definidas só na UI do Cursor.
 */
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./repoRoot.js";

let loaded = false;

export function loadLocalEnv(): void {
  if (loaded) return;
  loaded = true;
  const p = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
