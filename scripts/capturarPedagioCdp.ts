/**
 * Captura passiva (CDP) da sessão Pedágio Digital a partir de Chrome REAL.
 * O operador faz login (CPF/senha + reCAPTCHA) — sem automação Playwright.
 *
 * Captura cookie + CSRF de pedidos ao BFF após login autenticado.
 *
 * Uso: npx tsx scripts/capturarPedagioCdp.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { REPO_ROOT } from "../src/lib/repoRoot.js";
import { fecharChromeCdp } from "./lib/fecharChromeCdp.js";

const PORT = Number(process.env.PEDAGIO_CDP_PORT ?? "9225");
const PORTAL = "https://pedagiodigital.com/";
const API_HOST = "pedagiodigital.com";
const OUT_FILE = path.join(os.tmpdir(), "pedagio_capture.json");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "pedagio-digital");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");
const USER_DATA_DIR =
  process.env.PEDAGIO_CHROME_PROFILE ?? path.join(CACHE_DIR, "chrome-profile");
const TIMEOUT_MS = 15 * 60 * 1000;

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

const cap: { cookie?: string; csrf?: string } = {};
let okPrinted = false;

function persist(): void {
  if (!cap.cookie || !cap.csrf) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify({ cookie: cap.cookie, csrf: cap.csrf, savedAt: new Date().toISOString() }, null, 2) +
      "\n",
    "utf8",
  );
  fs.writeFileSync(OUT_FILE, JSON.stringify(cap, null, 2), "utf8");
  if (!okPrinted) {
    okPrinted = true;
    console.log(`CAPTURA_OK cookie=${cap.cookie.length}c csrf=${cap.csrf.length}c file=${OUT_FILE}`);
  }
}

function captured(): boolean {
  return Boolean(cap.cookie && cap.csrf);
}

function acharChrome(): string {
  for (const c of CHROME_CANDS) if (fs.existsSync(c)) return c;
  return "chrome";
}

async function devtoolsUp(): Promise<string | undefined> {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) {
      const j = (await r.json()) as { webSocketDebuggerUrl?: string };
      return j.webSocketDebuggerUrl;
    }
  } catch {
    /* offline */
  }
  return undefined;
}

async function esperarDevtools(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const url = await devtoolsUp();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("DevTools não respondeu na porta de depuração.");
}

function lerHeader(headers: Record<string, string>, nome: string): string | undefined {
  const alvo = nome.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === alvo) return v;
  }
  return undefined;
}

function csrfFromCookie(cookie: string): string {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === "bff-csrf" || name === "XSRF-TOKEN") return value;
  }
  return "";
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(API_HOST)) return;
  const cookie = lerHeader(headers, "cookie");
  if (!cookie?.includes("bff_sid")) return;
  const csrf = lerHeader(headers, "x-csrf-token") || csrfFromCookie(cookie);
  if (!csrf) return;
  cap.cookie = cookie;
  cap.csrf = csrf;
  persist();
}

async function main(): Promise<void> {
  let wsUrl = await devtoolsUp();
  if (!wsUrl) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    const child = spawn(
      acharChrome(),
      [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        PORTAL,
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
    wsUrl = await esperarDevtools();
  }

  console.log("Chrome (janela dedicada) aberto. Faça login no pedagiodigital.com (CPF/senha + reCAPTCHA).");
  console.log(
    "Após entrar, a lista de placas carrega sozinha — capturo cookie + CSRF. Ao capturar, o Chrome fecha sozinho.",
  );

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
    ws.send(JSON.stringify({ id: msgId++, method, params, sessionId }));
  };

  ws.on("open", () => {
    send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  });

  ws.on("message", (data: WebSocket.RawData) => {
    let msg: { method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.method === "Target.attachedToTarget") {
      const sid = msg.params?.sessionId as string | undefined;
      if (sid) send("Network.enable", {}, sid);
    } else if (msg.method === "Network.requestWillBeSent") {
      const req = msg.params?.request as { url?: string; headers?: Record<string, string> } | undefined;
      if (req?.url) tratarRequest(req.url, req.headers ?? {});
    }
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TIMEOUT_MS);
    let devtoolsFails = 0;
    const poll = setInterval(() => {
      if (captured()) {
        clearInterval(poll);
        clearTimeout(timer);
        console.log("Sessao capturada (cookie + CSRF).");
        resolve();
        return;
      }
      fetch(`http://127.0.0.1:${PORT}/json/version`)
        .then((r) => {
          if (r.ok) devtoolsFails = 0;
        })
        .catch(() => {
          devtoolsFails++;
          if (devtoolsFails >= 3) {
            clearInterval(poll);
            clearTimeout(timer);
            resolve();
          }
        });
    }, 1500);
  });

  try {
    ws.close();
  } catch {
    /* ignore */
  }
  if (captured()) {
    await fecharChromeCdp(PORT);
  }
  console.log(`FIM. sessão=${captured() ? "OK" : "não capturada"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
