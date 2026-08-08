/**
 * Grava SIGAPAY_* (env do utilizador Windows ou ficheiro de captura) em lanza.portal_sessions no RDS.
 *
 * Uso:
 *   npx tsx scripts/push-sigapay-session-rds.ts
 *   npx tsx scripts/push-sigapay-session-rds.ts --file %TEMP%\\sigapay_capture.json
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { closePgPool } from "@lanza/db";
import { saveSigapaySession } from "../src/lib/sigapay/sessionStore.js";

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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

function tokenLimpo(raw: string): string {
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function fromCaptureFile(filePath: string): {
  cookie?: string;
  token?: string;
  apiBase?: string | null;
} {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  const cookie = typeof raw.cookie === "string" ? raw.cookie.trim() : "";
  const token =
    typeof raw.token === "string"
      ? tokenLimpo(raw.token)
      : typeof raw.authorization === "string"
        ? tokenLimpo(raw.authorization)
        : "";
  const apiBase =
    typeof raw.apiBase === "string"
      ? raw.apiBase.trim()
      : typeof raw.api_base === "string"
        ? raw.api_base.trim()
        : null;
  return {
    cookie: cookie || undefined,
    token: token || undefined,
    apiBase,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";

  const fileArg = arg("--file");
  let cookie = userEnv("SIGAPAY_COOKIE");
  let token = userEnv("SIGAPAY_TOKEN");
  let apiBase = userEnv("SIGAPAY_API_BASE") || null;

  if (fileArg && existsSync(fileArg)) {
    const fromFile = fromCaptureFile(fileArg);
    cookie = fromFile.cookie || cookie;
    token = fromFile.token || token;
    apiBase = fromFile.apiBase ?? apiBase;
  }

  if (!cookie && !token) {
    throw new Error(
      "SIGAPAY_COOKIE/TOKEN ausentes. Rode .\\scripts\\login-sigapay.ps1 ou passe --file capture.json.",
    );
  }
  if (!process.env.PGPASSWORD?.trim()) {
    throw new Error("PGPASSWORD ausente — configure Postgres (set-postgres-user-env.ps1).");
  }

  const saved = await saveSigapaySession({
    cookie: cookie || undefined,
    token: token || undefined,
    apiBase,
  });

  console.log("OK: sessão SigaPay gravada no RDS (lanza.portal_sessions).");
  console.log(`  updatedAt: ${saved.updatedAt}`);
  if (saved.apiBase) console.log(`  apiBase: ${saved.apiBase}`);
  console.log(`  cookie: ${saved.cookie ? `${saved.cookie.length} chars` : "—"}`);
  console.log(`  token: ${saved.token ? `${saved.token.length} chars` : "—"}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
