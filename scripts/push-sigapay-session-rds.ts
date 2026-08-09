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

import { closePgPool, getPgConfig } from "@lanza/db";
import { saveSigapaySession } from "../src/lib/sigapay/sessionStore.js";

const PG_ENV_KEYS = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSSLMODE",
  "AWS_REGION",
  "AWS_ROLE_ARN",
] as const;

function pamAuthHelp(password?: string): string {
  const looksLikeIamToken =
    !!password &&
    (password.includes("X-Amz-Algorithm") || password.includes("Action=connect"));
  return [
    "Autenticação RDS falhou (PAM / IAM).",
    "",
    looksLikeIamToken
      ? "  PGPASSWORD parece ser um token IAM — expira em ~15 min."
      : "  PGPASSWORD pode estar expirado ou incorrecto.",
    "",
    "  Renovar token IAM (~15 min):",
    "    .\\scripts\\postgres-console-token.ps1 -Check",
    "",
    "  Ou senha estática permanente:",
    "    .\\scripts\\postgres-console-token.ps1 -SetPassword \"SuaSenhaSegura\"",
    "    .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
    "",
    "  Depois repita:",
    "    npx tsx scripts/push-sigapay-session-rds.ts",
  ].join("\n");
}

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

function syncPgEnvFromUser(): void {
  for (const name of PG_ENV_KEYS) {
    const v = userEnv(name);
    if (v) process.env[name] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";
  syncPgEnvFromUser();

  if (!process.env.PGHOST?.trim()) {
    throw new Error(
      "PGHOST ausente — configure Postgres: .\\scripts\\set-postgres-user-env.ps1",
    );
  }

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
    const msg = err instanceof Error ? err.message : String(err);
    const pgCode =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (msg.includes("PAM authentication failed") || pgCode === "28P01") {
      let passwordHint: string | undefined;
      try {
        passwordHint = getPgConfig().password;
      } catch {
        /* ignore */
      }
      console.error(pamAuthHelp(passwordHint));
    } else {
      console.error(msg);
    }
    process.exit(1);
  })
  .finally(() => closePgPool());
