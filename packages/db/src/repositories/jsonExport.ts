import fs from "node:fs";
import path from "node:path";

import { DATABASE_DIR } from "../paths.js";

/** Exporta documento JSON local como backup (dual-write). */
export function exportJsonBackup(fileName: string, data: object): void {
  if (process.env.LANZA_JSON_BACKUP === "0") return;
  const dir = process.env.LANZA_DATABASE_DIR?.trim() || DATABASE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, fileName);
  fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
