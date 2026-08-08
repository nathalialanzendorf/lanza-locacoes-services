/**
 * Extrai SIGAPAY_COOKIE / TOKEN / API_BASE de captura CDP ou ficheiro HAR (mitmproxy/Charles).
 *
 * Uso:
 *   npx tsx scripts/parseSigapayMitmCapture.ts --har capture.har
 *   npx tsx scripts/parseSigapayMitmCapture.ts --file %TEMP%\\sigapay_capture.json
 *   npx tsx scripts/parseSigapayMitmCapture.ts --har app.har --push-rds
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { closePgPool } from "@lanza/db";
import { saveSigapaySession } from "../src/lib/sigapay/sessionStore.js";

type SessionBits = {
  cookie?: string;
  token?: string;
  apiBase?: string | null;
  sampleUrl?: string;
  samplePath?: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function hostOk(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("sigapay") || h.includes("zonaazul");
  } catch {
    return /sigapay|zonaazul/i.test(url);
  }
}

function tokenLimpo(raw: string): string {
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function mergeSession(target: SessionBits, next: SessionBits): void {
  if (next.cookie && (!target.cookie || next.cookie.length > target.cookie.length)) {
    target.cookie = next.cookie;
  }
  if (next.token && (!target.token || next.token.length > target.token.length)) {
    target.token = next.token;
  }
  if (next.apiBase && !target.apiBase) target.apiBase = next.apiBase;
  if (next.sampleUrl && !target.sampleUrl) target.sampleUrl = next.sampleUrl;
  if (next.samplePath && !target.samplePath) target.samplePath = next.samplePath;
}

function sessionFromRequest(url: string, headers: Record<string, string>): SessionBits | null {
  if (!hostOk(url)) return null;
  const cookie = headers.cookie ?? headers.Cookie;
  const auth = headers.authorization ?? headers.Authorization;
  const out: SessionBits = {};
  if (cookie?.trim()) out.cookie = cookie.trim();
  if (auth?.trim()) out.token = tokenLimpo(auth);
  if (!out.cookie && !out.token) return null;

  try {
    const u = new URL(url);
    if (u.pathname.includes("/api") || /Aviso|Placa|Veiculo/i.test(u.pathname)) {
      out.apiBase = `${u.origin}/api`;
      out.samplePath = u.pathname;
    }
    out.sampleUrl = url;
  } catch {
    out.sampleUrl = url;
  }
  return out;
}

function parseHar(filePath: string): SessionBits {
  const har = JSON.parse(readFileSync(filePath, "utf8")) as {
    log?: { entries?: Array<{ request?: { url?: string; headers?: Array<{ name: string; value: string }> } }> };
  };
  const entries = har.log?.entries ?? [];
  const acc: SessionBits = {};

  for (const entry of entries) {
    const url = entry.request?.url ?? "";
    if (!url) continue;
    const headers: Record<string, string> = {};
    for (const h of entry.request?.headers ?? []) {
      headers[h.name.toLowerCase()] = h.value;
    }
    const bits = sessionFromRequest(url, headers);
    if (bits) mergeSession(acc, bits);
  }
  return acc;
}

function parseCaptureJson(filePath: string): SessionBits {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  return {
    cookie: typeof raw.cookie === "string" ? raw.cookie.trim() : undefined,
    token:
      typeof raw.token === "string"
        ? tokenLimpo(raw.token)
        : typeof raw.authorization === "string"
          ? tokenLimpo(raw.authorization)
          : undefined,
    apiBase:
      typeof raw.apiBase === "string"
        ? raw.apiBase.trim()
        : typeof raw.api_base === "string"
          ? raw.api_base.trim()
          : null,
  };
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

async function main(): Promise<void> {
  const har = arg("--har");
  const file = arg("--file");
  if (!har && !file) {
    console.error(`Uso:
  npx tsx scripts/parseSigapayMitmCapture.ts --har capture.har
  npx tsx scripts/parseSigapayMitmCapture.ts --file sigapay_capture.json [--push-rds]`);
    process.exit(1);
  }

  const session = har ? parseHar(har) : parseCaptureJson(file!);
  if (!session.cookie && !session.token) {
    throw new Error("Nenhum cookie/token SigaPay encontrado no ficheiro.");
  }

  console.log("Sessão extraída:");
  console.log(`  SIGAPAY_API_BASE=${session.apiBase ?? "https://sigapay.com.br/api"}`);
  if (session.samplePath) console.log(`  amostra path: ${session.samplePath}`);
  if (session.sampleUrl) console.log(`  amostra url: ${session.sampleUrl.slice(0, 120)}…`);
  console.log(`  cookie: ${session.cookie ? `${session.cookie.length} chars` : "—"}`);
  console.log(`  token: ${session.token ? `${session.token.length} chars` : "—"}`);

  if (session.samplePath?.includes("list-logado")) {
    console.log("\n  → Sugestão: SIGAPAY_PATH_AVISOS=" + session.samplePath);
  }

  if (!flag("--push-rds")) {
    console.log("\nPara gravar no RDS: acrescente --push-rds (requer PGPASSWORD).");
    return;
  }

  loadEnvLocal();
  process.env.LANZA_DB_BACKEND = "postgres";
  if (!process.env.PGPASSWORD?.trim()) {
    throw new Error("PGPASSWORD ausente — configure Postgres antes de --push-rds.");
  }

  const saved = await saveSigapaySession({
    cookie: session.cookie,
    token: session.token,
    apiBase: session.apiBase ?? null,
  });
  console.log("\nOK: sessão gravada no RDS.");
  console.log(`  updatedAt: ${saved.updatedAt}`);

  if (process.platform === "win32") {
    try {
      if (session.cookie) {
        execSync(
          `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('SIGAPAY_COOKIE','${session.cookie.replace(/'/g, "''")}','User')"`,
        );
      }
      if (session.token) {
        execSync(
          `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('SIGAPAY_TOKEN','${session.token.replace(/'/g, "''")}','User')"`,
        );
      }
      if (session.apiBase) {
        execSync(
          `powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('SIGAPAY_API_BASE','${session.apiBase.replace(/'/g, "''")}','User')"`,
        );
      }
      console.log("  Variáveis SIGAPAY_* também gravadas no perfil Windows (User).");
    } catch {
      console.log("  (Aviso: não foi possível gravar variáveis Windows automaticamente.)");
    }
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
