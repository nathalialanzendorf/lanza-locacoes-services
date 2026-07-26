#!/usr/bin/env node
/**
 * Cria Blob store na Vercel e liga ao projeto lanza-locacoes-services.
 *
 * Token (uma opção):
 *   $env:VERCEL_TOKEN = "..."   # vercel.com/account/tokens
 *   node scripts/set-vercel-blob.mjs
 *
 *   npx vercel login  (grava ~/.vercel/auth.json)
 *
 * Alternativa CLI (projeto linkado):
 *   npx vercel link
 *   npx vercel blob create-store lanza-docs --access private --yes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const storeName =
  args.find((a) => a.startsWith("--name="))?.split("=")[1] ?? "lanza-docs";
const projectName =
  args.find((a) => a.startsWith("--project="))?.split("=")[1] ?? "lanza-locacoes-services";
const teamId =
  args.find((a) => a.startsWith("--team="))?.split("=")[1] ?? "team_TxQccO1Nw52O2cCmyP35wtp";
const access =
  args.find((a) => a.startsWith("--access="))?.split("=")[1] ?? "private";

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

function getVercelToken() {
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  loadEnvFile(path.join(root, ".env.local"));
  if (process.env.VERCEL_TOKEN?.trim()) return process.env.VERCEL_TOKEN.trim();
  const authFile = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".vercel",
    "auth.json",
  );
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

async function vercelFetch(token, method, apiPath, body) {
  const url = `https://api.vercel.com${apiPath}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${method} ${apiPath}: ${text.slice(0, 400)}`);
  }
  return json;
}

async function getProjectId(token) {
  const data = await vercelFetch(
    token,
    "GET",
    `/v9/projects/${encodeURIComponent(projectName)}?teamId=${encodeURIComponent(teamId)}`,
  );
  const id = data?.id?.trim();
  if (!id) throw new Error(`Project id não encontrado para ${projectName}`);
  return id;
}

async function listBlobStores(token) {
  const data = await vercelFetch(
    token,
    "GET",
    `/v1/storage/stores?teamId=${encodeURIComponent(teamId)}`,
  );
  return Array.isArray(data?.stores) ? data.stores : [];
}

async function createBlobStore(token) {
  return vercelFetch(
    token,
    "POST",
    `/v1/storage/stores/blob?teamId=${encodeURIComponent(teamId)}`,
    { name: storeName, billingState: "active", access },
  );
}

async function connectStore(token, storeId, projectId) {
  return vercelFetch(
    token,
    "POST",
    `/v1/storage/stores/${encodeURIComponent(storeId)}/connections?teamId=${encodeURIComponent(teamId)}`,
    { projectId, envVarPrefix: "" },
  );
}

async function main() {
  const token = getVercelToken();
  if (!token) {
    console.error("Sem token Vercel.");
    console.error('  $env:VERCEL_TOKEN = "..."   # https://vercel.com/account/tokens');
    console.error("  npx vercel login");
    process.exit(1);
  }

  console.log(`Projeto: ${projectName}`);
  console.log(`Team:    ${teamId}`);
  console.log(`Store:   ${storeName} (${access})`);
  console.log("");

  const projectId = await getProjectId(token);
  console.log(`Project id: ${projectId}`);

  const existing = await listBlobStores(token);
  let store = existing.find((s) => s?.name === storeName && s?.type === "blob");
  if (store?.id) {
    console.log(`Blob store já existe: ${store.id}`);
  } else if (dryRun) {
    console.log("[dry-run] Criaria blob store", storeName);
  } else {
    const created = await createBlobStore(token);
    store = created?.store ?? created;
    console.log(`Blob store criado: ${store?.id ?? "(sem id)"}`);
  }

  const storeId = store?.id?.trim();
  if (!storeId) {
    throw new Error("Store id ausente após create/list");
  }

  if (dryRun) {
    console.log(`[dry-run] Ligar store ${storeId} ao projeto ${projectId}`);
    console.log("Depois: Deployments → Redeploy Production");
    return;
  }

  await connectStore(token, storeId, projectId);
  console.log("");
  console.log("OK — Blob ligado ao projeto.");
  console.log("Variáveis injetadas: BLOB_STORE_ID, BLOB_READ_WRITE_TOKEN (e OIDC no runtime).");
  console.log("");
  console.log("Próximo passo: Deployments → Redeploy Production");
  console.log(
    `  https://vercel.com/lanzalocacoes/${projectName}/settings/environment-variables`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
