/**
 * Grava DETRAN_SC_* (env do utilizador Windows) em lanza.portal_sessions no RDS.
 * Uso: npx tsx scripts/push-detran-sc-session-rds.ts
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { closePgPool } from "@lanza/db";
import { saveDetranScSession } from "../src/lib/detranSc/sessionStore.js";

function loadEnvLocal(): void {
  const envLocal = resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocal)) return;
  for (const line of readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]!]) continue;
    let v = m[2]!.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]!] = v;
  }
}

function userEnv(name: string): string {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  try {
    return execSync(
      `powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('${name}','User')"`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";

  const auth = userEnv("DETRAN_SC_AUTH");
  const empresa = userEnv("DETRAN_SC_EMPRESA");
  const appVersion = userEnv("DETRAN_SC_APP_VERSION");

  if (!auth || !empresa) {
    throw new Error(
      "DETRAN_SC_AUTH e DETRAN_SC_EMPRESA ausentes. Rode .\\scripts\\login-detran-sc.ps1 primeiro.",
    );
  }
  if (!process.env.PGPASSWORD?.trim()) {
    throw new Error("PGPASSWORD ausente — configure Postgres (set-postgres-user-env.ps1).");
  }

  const saved = await saveDetranScSession({
    auth,
    empresa,
    appVersion: appVersion || null,
  });

  console.log("OK: sessão DETRAN SC gravada no RDS.");
  console.log(`  empresa: ${saved.empresa}`);
  console.log(`  updatedAt: ${saved.updatedAt}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
