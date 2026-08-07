/**
 * Captura passiva (CDP) do token DETRAN RS a partir de Chrome REAL.
 * O operador faz login gov.br (certificado A1 ou CPF/senha) — sem automação Playwright.
 *
 * Captura, de chamadas a pcsdetran.procergs.com.br:
 *   - Authorization (Bearer) -> DETRAN_RS_AUTH
 *   - X-User-Id              -> DETRAN_RS_USER_ID
 *
 * Uso: npx tsx scripts/capturarDetranRsCdp.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { fecharChromeCdp } from "./lib/fecharChromeCdp.js";

const PORT = Number(process.env.DETRAN_RS_CDP_PORT ?? "9223");
const PORTAL = "https://pcsdetran.rs.gov.br/";
const API_HOST = "pcsdetran.procergs.com.br";
const OUT_FILE = path.join(os.tmpdir(), "detran_rs_capture.json");
const USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ?? path.join(os.tmpdir(), "lanza_chrome_detran_rs");
const TIMEOUT_MS = 15 * 60 * 1000;

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

const cap: { auth?: string; userId?: string } = {};
let okPrinted = false;

function persist(): void {
  fs.writeFileSync(OUT_FILE, JSON.stringify(cap, null, 2), "utf8");
  if (cap.auth && cap.userId && !okPrinted) {
    okPrinted = true;
    console.log(
      `CAPTURA_OK auth=${cap.auth.length}c userId=${cap.userId.length}c file=${OUT_FILE}`,
    );
  }
}

function captured(): boolean {
  return Boolean(cap.auth && cap.userId);
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

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(API_HOST)) return;
  const auth = lerHeader(headers, "authorization");
  const uid = lerHeader(headers, "x-user-id");
  let changed = false;
  if (auth && /^Bearer\s/i.test(auth)) {
    cap.auth = auth.replace(/^Bearer\s+/i, "");
    changed = true;
  }
  if (uid) {
    cap.userId = uid;
    changed = true;
  }
  if (changed) persist();
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

  console.log("Chrome (janela dedicada) aberto. Faça login gov.br (certificado ou CPF/senha).");
  console.log(
    "Navegue até o portal carregar a frota — capturo Authorization + X-User-Id da rede. Ao capturar, o Chrome fecha sozinho.",
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
    const poll = setInterval(() => {
      if (captured()) {
        clearInterval(poll);
        clearTimeout(timer);
        console.log("Sessão capturada (auth + userId).");
        resolve();
        return;
      }
      fetch(`http://127.0.0.1:${PORT}/json/version`).catch(() => {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
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
  console.log(
    `FIM. token=${cap.auth ? "OK" : "não capturado"} | userId=${cap.userId ? "OK" : "não capturado"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
