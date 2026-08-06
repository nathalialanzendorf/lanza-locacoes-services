/**
 * Captura passiva (CDP) do token Rastreame a partir de Chrome REAL.
 * O operador faz login em rastreame.com.br - sem automacao Playwright.
 *
 * Captura accessToken via:
 *   1) header X-r2f-auth em pedidos autenticados (mais fiavel)
 *   2) corpo JSON do POST /auth/rest/login*
 *   3) fallback API com RASTREAME_LOGIN + RASTREAME_SENHA
 *
 * Uso: npx tsx scripts/capturarRastreameCdp.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { loginRastreame } from "../src/lib/rastreame/auth.js";

const PORT = Number(process.env.RASTREAME_CDP_PORT ?? "9226");
const PORTAL = "https://rastreame.com.br/";
const LOGIN_HOST = "rastreame.com.br";
const OUT_FILE = path.join(os.tmpdir(), "rastreame_capture.json");
const USER_DATA_DIR =
  process.env.RASTREAME_CHROME_PROFILE ?? path.join(os.tmpdir(), "lanza_chrome_rastreame");
const TIMEOUT_MS = 10 * 60 * 1000;

const LOGIN = process.env.RASTREAME_LOGIN?.trim() ?? "";
const SENHA = process.env.RASTREAME_SENHA ?? "";

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

const cap: { token?: string; authFormat?: string; rawAuthLen?: number } = {};
let okPrinted = false;

type CdpMsg = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: { body?: string; base64Encoded?: boolean };
  error?: { message?: string };
  sessionId?: string;
};

function molde(decoded: string): string {
  let s = decoded;
  if (SENHA) s = s.split(SENHA).join("{SENHA}");
  if (LOGIN) s = s.split(LOGIN).join("{LOGIN}");
  return s;
}

function persist(): void {
  fs.writeFileSync(OUT_FILE, JSON.stringify(cap, null, 2), "utf8");
  if (cap.token && !okPrinted) {
    okPrinted = true;
    console.log(
      `CAPTURA_OK token=${cap.token.length}c authFormat=${cap.authFormat ?? "?"} file=${OUT_FILE}`,
    );
  }
}

function captured(): boolean {
  return Boolean(cap.token);
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
  throw new Error("DevTools nao respondeu na porta de depuracao.");
}

function lerHeader(headers: Record<string, string>, nome: string): string | undefined {
  const alvo = nome.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === alvo) return v;
  }
  return undefined;
}

function tratarLoginBody(body: string): void {
  try {
    const data = JSON.parse(body) as { accessToken?: string; token?: string };
    const token = data?.accessToken ?? data?.token;
    if (token) {
      cap.token = token;
      persist();
    }
  } catch {
    /* nao-JSON */
  }
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(LOGIN_HOST)) return;

  const tokenHeader = lerHeader(headers, "x-r2f-auth");
  if (tokenHeader?.trim()) {
    cap.token = tokenHeader.trim();
    persist();
    return;
  }

  if (!/\/auth\/rest\/login/i.test(url)) return;
  const auth = lerHeader(headers, "authorization");
  if (!auth) return;
  cap.rawAuthLen = auth.length;
  const semScheme = auth.replace(/^[A-Za-z]+\s+/, "");
  try {
    cap.authFormat = molde(Buffer.from(semScheme, "base64").toString("utf8"));
  } catch {
    cap.authFormat = molde(auth);
  }
  persist();
}

async function fallbackLoginApi(): Promise<void> {
  if (cap.token || !LOGIN || !SENHA) return;
  console.log("CDP nao capturou token - tentando login via API (RASTREAME_LOGIN/SENHA)...");
  const token = await loginRastreame();
  if (token) {
    cap.token = token;
    persist();
    console.log(`CAPTURA_OK token=${token.length}c origem=api file=${OUT_FILE}`);
  }
}

async function main(): Promise<void> {
  if (fs.existsSync(OUT_FILE)) fs.rmSync(OUT_FILE, { force: true });

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

  console.log("Chrome (janela dedicada) aberto. Faca login no rastreame.com.br.");
  if (LOGIN) {
    console.log(`RASTREAME_LOGIN=${LOGIN} no env - preencha a senha na janela se preciso.`);
  }
  console.log(
    "Capturo o token do login (X-r2f-auth ou resposta JSON). Aguarde o portal carregar apos entrar.",
  );

  const pendingLogin = new Map<string, { sessionId?: string }>();
  const responseBodyIds = new Map<number, string>();

  const ws = new WebSocket(wsUrl);
  let msgId = 1;

  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string): number => {
    const id = msgId++;
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    return id;
  };

  ws.on("open", () => {
    send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  });

  ws.on("message", (data: WebSocket.RawData) => {
    let msg: CdpMsg;
    try {
      msg = JSON.parse(data.toString()) as CdpMsg;
    } catch {
      return;
    }

    if (msg.method === "Target.attachedToTarget") {
      const sid = msg.params?.sessionId as string | undefined;
      if (sid) send("Network.enable", {}, sid);
      return;
    }

    if (msg.method === "Network.requestWillBeSent") {
      const req = msg.params?.request as { url?: string; headers?: Record<string, string> } | undefined;
      if (req?.url) tratarRequest(req.url, req.headers ?? {});
      return;
    }

    if (msg.method === "Network.responseReceived") {
      const response = msg.params?.response as { url?: string } | undefined;
      const requestId = msg.params?.requestId as string | undefined;
      const url = response?.url ?? "";
      if (requestId && url.includes(LOGIN_HOST) && /\/auth\/rest\/login/i.test(url)) {
        pendingLogin.set(requestId, { sessionId: msg.sessionId });
      }
      return;
    }

    if (msg.method === "Network.loadingFinished") {
      const requestId = msg.params?.requestId as string | undefined;
      const sessionId = msg.sessionId ?? pendingLogin.get(requestId ?? "")?.sessionId;
      if (requestId && pendingLogin.has(requestId)) {
        pendingLogin.delete(requestId);
        const id = send("Network.getResponseBody", { requestId }, sessionId);
        responseBodyIds.set(id, requestId);
      }
      return;
    }

    if (msg.id && responseBodyIds.has(msg.id)) {
      responseBodyIds.delete(msg.id);
      if (msg.error) return;
      let body = msg.result?.body ?? "";
      if (msg.result?.base64Encoded) {
        body = Buffer.from(body, "base64").toString("utf8");
      }
      tratarLoginBody(body);
    }
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TIMEOUT_MS);
    let devtoolsFails = 0;
    const poll = setInterval(() => {
      if (captured()) {
        clearInterval(poll);
        clearTimeout(timer);
        console.log("Token capturado - pode fechar o Chrome.");
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

  await fallbackLoginApi();

  console.log(`FIM. token=${cap.token ? "OK" : "nao capturado"} authFormat=${cap.authFormat ?? "?"}`);
  if (!cap.token) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
