#!/usr/bin/env node
/**
 * Grava variaveis Postgres/RDS no projeto Vercel da API (REST API, sem npx vercel).
 *
 * Token (uma opcao):
 *   $env:VERCEL_TOKEN = "..."   # vercel.com/account/tokens
 *   node scripts/set-vercel-postgres-env.mjs
 *
 *   npx vercel login  (grava ~/.vercel/auth.json)
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const printOnly = args.includes("--print-only");
const dryRun = args.includes("--dry-run");
const backendArg = args.find((a) => a.startsWith("--backend="));
const backend = backendArg?.split("=")[1] ?? "postgres";
const projectName =
  args.find((a) => a.startsWith("--project="))?.split("=")[1] ?? "lanza-locacoes-services";
const teamId =
  args.find((a) => a.startsWith("--team="))?.split("=")[1] ?? "team_TxQccO1Nw52O2cCmyP35wtp";

const vars = {
  LANZA_DB_BACKEND: backend,
  LANZA_DB_RELATIONAL: "1",
  LANZA_WEB_URL: "https://lanzalocacoes.vercel.app",
  LANZA_API_PUBLIC_URL: "https://api.lanzalocacoes.vercel.app",
};

if (backend !== "file") {
  Object.assign(vars, {
    PGHOST: "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com",
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGSSLMODE: "require",
    AWS_REGION: "us-east-1",
    AWS_ACCOUNT_ID: "154601375525",
    AWS_RESOURCE_ARN: "arn:aws:rds:us-east-1:154601375525:cluster:aws-pg-lanza-locacoes",
    AWS_RESOURCE_TYPE: "rds",
    AWS_ROLE_ARN: "arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes",
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function resolveJwtSecret() {
  if (process.env.LANZA_JWT_SECRET?.trim()) {
    return { value: process.env.LANZA_JWT_SECRET.trim(), generated: false };
  }
  loadEnvFile(path.join(root, ".env.local"));
  if (process.env.LANZA_JWT_SECRET?.trim()) {
    return { value: process.env.LANZA_JWT_SECRET.trim(), generated: false };
  }
  return { value: randomBytes(32).toString("base64url"), generated: true };
}

const { value: jwtSecretValue, generated: jwtSecretGenerated } = resolveJwtSecret();
vars.LANZA_JWT_SECRET = jwtSecretValue;
vars.LANZA_JWT_EXPIRES_IN = process.env.LANZA_JWT_EXPIRES_IN?.trim() || "7d";

function getVercelToken() {
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  loadEnvFile(path.join(root, ".env.local"));
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  const authFile = path.join(process.env.USERPROFILE || process.env.HOME || "", ".vercel", "auth.json");
  if (fs.existsSync(authFile)) {
    try {
      const auth = JSON.parse(fs.readFileSync(authFile, "utf8"));
      if (auth.token) return String(auth.token);
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function upsertEnv(token, key, value, type = "plain") {
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectName)}/env?upsert=true&teamId=${encodeURIComponent(teamId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type,
      target: ["production", "preview", "development"],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

console.log(`Projeto: ${projectName}`);
console.log(`Team:    ${teamId}`);
console.log(`Backend: LANZA_DB_BACKEND=${backend}`);
console.log("");
console.log("Variaveis:");
for (const [k, v] of Object.entries(vars)) {
  if (k === "LANZA_JWT_SECRET") {
    console.log(`  ${k}=*** (${v.length} chars)`);
  } else {
    console.log(`  ${k}=${v}`);
  }
}
if (jwtSecretGenerated) {
  console.log("");
  console.log("AVISO: LANZA_JWT_SECRET gerado agora — guarde este valor:");
  console.log(`  ${vars.LANZA_JWT_SECRET}`);
}
console.log("");

if (printOnly) {
  console.log("Dashboard:");
  console.log(`  https://vercel.com/lanzalocacoes/${projectName}/settings/environment-variables`);
  console.log("Depois: Deployments -> Redeploy Production");
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Nenhuma alteracao.");
  process.exit(0);
}

const token = getVercelToken();
if (!token) {
  console.error("ERRO: token Vercel ausente.");
  console.error("");
  console.error("Opcao 1 - token no PowerShell:");
  console.error('  $env:VERCEL_TOKEN = "..."   # https://vercel.com/account/tokens');
  console.error("  node scripts/set-vercel-postgres-env.mjs");
  console.error("");
  console.error("Opcao 2 - dashboard manual:");
  console.error("  node scripts/set-vercel-postgres-env.mjs --print-only");
  process.exit(1);
}

console.log("Token Vercel: OK");
console.log("");

const failed = [];
for (const [key, value] of Object.entries(vars)) {
  process.stdout.write(`-> ${key} ... `);
  try {
    const type = key === "LANZA_JWT_SECRET" ? "sensitive" : "plain";
    await upsertEnv(token, key, value, type);
    console.log("OK");
  } catch (err) {
    console.log("FALHOU");
    failed.push({ key, err: err instanceof Error ? err.message : String(err) });
  }
}

console.log("");
if (failed.length) {
  console.error("Falhas:");
  for (const f of failed) console.error(`  ${f.key}: ${f.err}`);
  process.exit(1);
}

console.log("OK. Faca Redeploy Production na Vercel.");
console.log("Verificar:");
console.log("  curl https://api.lanzalocacoes.vercel.app/api/auth/status");
console.log('  (esperado: "jwtConfigured": true)');
