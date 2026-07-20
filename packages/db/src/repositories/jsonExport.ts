import fs from "node:fs";
import path from "node:path";

import { DATABASE_DIR } from "../paths.js";
import { isReadOnlyServerlessFs } from "../util/serverlessFs.js";

/** Exporta documento JSON local como backup (dual-write). */
export function exportJsonBackup(fileName: string, data: object): void {
  if (process.env.LANZA_JSON_BACKUP === "0") return;
  if (isReadOnlyServerlessFs()) return;
  const dir = process.env.LANZA_DATABASE_DIR?.trim() || DATABASE_DIR;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(dir, fileName);
    fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[lanza/db] Backup JSON ignorado (${fileName}): ${msg}`);
  }
}
