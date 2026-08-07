#!/usr/bin/env node
/**
 * Grava credenciais de portais (Rastreame, Pedagio Digital) no projeto API na Vercel.
 *
 * Rastreame: RASTREAME_LOGIN + RASTREAME_SENHA — login automatico headless na Vercel.
 * Pedagio:   PEDAGIO_DIGITAL_LOGIN + PEDAGIO_DIGITAL_SENHA + solver reCAPTCHA
 *            (PEDAGIO_DIGITAL_CAPTCHA_PROVIDER + PEDAGIO_DIGITAL_CAPTCHA_APIKEY).
 *
 * Token (uma opcao):
 *   $env:VERCEL_TOKEN = "..."   # vercel.com/account/tokens
 *   node scripts/set-vercel-portal-env.mjs
 *
 *   npx vercel login  (grava ~/.vercel/auth.json)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const printOnly = args.includes("--print-only");
const dryRun = args.includes("--dry-run");
const projectName =
  args.find((a) => a.startsWith("--project="))?.split("=")[1] ?? "lanza-locacoes-services";
const teamId =
  args.find((a) => a.startsWith("--team="))?.split("=")[1] ?? "team_TxQccO1Nw52O2cCmyP35wtp";

function argValue(name) {
  const pref = `--${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
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

loadEnvFile(path.join(root, ".env.local"));

/** @type {Record<string, { value: string; sensitive: boolean }>} */
const vars = {};

function setVar(key, cliName, envNames = [key]) {
  const fromCli = argValue(cliName);
  if (fromCli?.trim()) {
    vars[key] = { value: fromCli.trim(), sensitive: true };
    return;
  }
  for (const name of envNames) {
    const v = process.env[name]?.trim();
    if (v) {
      vars[key] = { value: v, sensitive: true };
      return;
    }
  }
}

setVar("RASTREAME_LOGIN", "rastreame-login");
setVar("RASTREAME_SENHA", "rastreame-senha");
setVar("PEDAGIO_DIGITAL_LOGIN", "pedagio-login");
setVar("PEDAGIO_DIGITAL_SENHA", "pedagio-senha");

const captchaProvider = argValue("pedagio-captcha-provider") ?? process.env.PEDAGIO_DIGITAL_CAPTCHA_PROVIDER?.trim();
const captchaApiKey = argValue("pedagio-captcha-apikey") ?? process.env.PEDAGIO_DIGITAL_CAPTCHA_APIKEY?.trim();
if (captchaProvider) {
  vars.PEDAGIO_DIGITAL_CAPTCHA_PROVIDER = { value: captchaProvider, sensitive: false };
}
if (captchaApiKey) {
  vars.PEDAGIO_DIGITAL_CAPTCHA_APIKEY = { value: captchaApiKey, sensitive: true };
}

function getVercelToken() {
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

async function upsertEnv(token, key, value, type = "sensitive") {
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
console.log("");

if (!Object.keys(vars).length) {
  console.error("ERRO: nenhuma credencial encontrada.");
  console.error("");
  console.error("Defina no env do utilizador Windows ou passe argumentos:");
  console.error("  --rastreame-login=... --rastreame-senha=...");
  console.error("  --pedagio-login=... --pedagio-senha=...");
  console.error("  --pedagio-captcha-provider=capsolver --pedagio-captcha-apikey=...");
  console.error("");
  console.error("Ou no PowerShell:");
  console.error('  .\\scripts\\set-vercel-portal-env.ps1 -RastreameLogin "..." -RastreameSenha "..."');
  process.exit(1);
}

console.log("Variaveis a gravar na Vercel:");
for (const [k, { value, sensitive }] of Object.entries(vars)) {
  console.log(`  ${k}=${sensitive ? "***" : value}`);
}
console.log("");

const hasPedagioLogin = Boolean(vars.PEDAGIO_DIGITAL_LOGIN && vars.PEDAGIO_DIGITAL_SENHA);
const hasPedagioCaptcha = Boolean(vars.PEDAGIO_DIGITAL_CAPTCHA_APIKEY);
if (hasPedagioLogin && !hasPedagioCaptcha) {
  console.log("AVISO Pedagio: login/senha sozinhas nao bastam na Vercel (reCAPTCHA).");
  console.log("  Adicione solver: PEDAGIO_DIGITAL_CAPTCHA_PROVIDER + PEDAGIO_DIGITAL_CAPTCHA_APIKEY");
  console.log("  Ou use cookie/csrf capturados localmente (login-pedagio.ps1) — expiram em minutos.");
  console.log("");
}

if (printOnly) {
  console.log("Dashboard:");
  console.log(`  https://vercel.com/lanzalocacoes/${projectName}/settings/environment-variables`);
  console.log("Depois: Deployments -> Redeploy Production");
  console.log("");
  console.log("Verificar Rastreame:");
  console.log("  curl https://api.lanzalocacoes.vercel.app/api/rastreame/auth");
  process.exit(0);
}

if (dryRun) {
  console.log("[dry-run] Nenhuma alteracao.");
  process.exit(0);
}

const token = getVercelToken();
if (!token) {
  console.error("ERRO: token Vercel ausente.");
  console.error('  $env:VERCEL_TOKEN = "..."   # https://vercel.com/account/tokens');
  console.error("  node scripts/set-vercel-portal-env.mjs");
  process.exit(1);
}

console.log("Token Vercel: OK");
console.log("");

const failed = [];
for (const [key, { value, sensitive }] of Object.entries(vars)) {
  process.stdout.write(`-> ${key} ... `);
  try {
    await upsertEnv(token, key, value, sensitive ? "sensitive" : "plain");
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
console.log("  curl https://api.lanzalocacoes.vercel.app/api/rastreame/auth");
