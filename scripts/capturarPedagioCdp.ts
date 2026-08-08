/**
 * Captura passiva (CDP) da sessão Pedágio Digital a partir de Chrome REAL.
 * O operador faz login (CPF/senha + reCAPTCHA) — sem automação Playwright.
 *
 * Liga-se a cada ABA (não ao browser root) para evitar "Debugger is paused"
 * e captura cookie + CSRF de pedidos ao BFF após login autenticado.
 *
 * Uso: npx tsx scripts/capturarPedagioCdp.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { REPO_ROOT } from "../src/lib/repoRoot.js";
import { cdpKeepOpen, fecharChromeCdp } from "./lib/fecharChromeCdp.js";

const PORT = Number(process.env.PEDAGIO_CDP_PORT ?? "9225");
const PORTAL = "https://pedagiodigital.com/";
const OUT_FILE = path.join(os.tmpdir(), "pedagio_capture.json");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "pedagio-digital");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");
const USER_DATA_DIR =
  process.env.PEDAGIO_CHROME_PROFILE ?? path.join(CACHE_DIR, "chrome-profile");
const TIMEOUT_MS = 15 * 60 * 1000;
const keepOpen = cdpKeepOpen() || process.env.PEDAGIO_CDP_KEEP_OPEN === "1";

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

type TabTarget = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

type CdpCookie = { name: string; value: string };

const cap: { cookie?: string; csrf?: string } = {};
let okPrinted = false;
const pageSockets = new Map<string, WebSocket>();

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

function hostOk(url: string): boolean {
  try {
    return /(^|\.)pedagiodigital\.com$/i.test(new URL(url).hostname);
  } catch {
    return /pedagiodigital\.com/i.test(url);
  }
}

async function devtoolsUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function listarAbas(): Promise<TabTarget[]> {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    if (!r.ok) return [];
    const tabs = (await r.json()) as TabTarget[];
    return tabs.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

async function esperarDevtools(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await devtoolsUp()) return;
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

function montarSessaoDeCookies(cookies: CdpCookie[]): void {
  const byName = new Map<string, string>();
  for (const c of cookies) byName.set(c.name, c.value);
  if (!byName.has("bff_sid")) return;
  const csrf = byName.get("bff-csrf") ?? byName.get("XSRF-TOKEN") ?? "";
  if (!csrf) return;
  const cookieHeader = [...byName].map(([k, v]) => `${k}=${v}`).join("; ");
  cap.cookie = cookieHeader;
  cap.csrf = csrf;
  persist();
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!hostOk(url)) return;
  const cookie = lerHeader(headers, "cookie");
  if (!cookie?.includes("bff_sid")) return;
  const csrf = lerHeader(headers, "x-csrf-token") || csrfFromCookie(cookie);
  if (!csrf) return;
  cap.cookie = cookie;
  cap.csrf = csrf;
  persist();
}

function tratarAssociatedCookies(
  associated: Array<{ cookie?: CdpCookie }> | undefined,
): void {
  if (!associated?.length) return;
  const cookies = associated.map((a) => a.cookie).filter(Boolean) as CdpCookie[];
  if (cookies.length) montarSessaoDeCookies(cookies);
}

function tratarResponseCookies(cookies: CdpCookie[] | undefined): void {
  if (cookies?.length) montarSessaoDeCookies(cookies);
}

function anexarAba(tab: TabTarget): void {
  const wsUrl = tab.webSocketDebuggerUrl!;
  if (pageSockets.has(wsUrl)) return;

  const ws = new WebSocket(wsUrl);
  pageSockets.set(wsUrl, ws);
  let msgId = 1;

  ws.on("open", () => {
    ws.send(JSON.stringify({ id: msgId++, method: "Network.enable", params: {} }));
  });

  ws.on("message", (data: WebSocket.RawData) => {
    let msg: { method?: string; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.method === "Network.requestWillBeSent") {
      const req = msg.params?.request as { url?: string; headers?: Record<string, string> } | undefined;
      if (req?.url) tratarRequest(req.url, req.headers ?? {});
    } else if (msg.method === "Network.requestWillBeSentExtraInfo") {
      tratarAssociatedCookies(
        msg.params?.associatedCookies as Array<{ cookie?: CdpCookie }> | undefined,
      );
    } else if (msg.method === "Network.responseReceivedExtraInfo") {
      tratarResponseCookies(msg.params?.cookies as CdpCookie[] | undefined);
      const headers = msg.params?.headers as Record<string, string> | undefined;
      const setCookie = headers ? lerHeader(headers, "set-cookie") : undefined;
      if (setCookie?.includes("bff_sid")) {
        const csrf = csrfFromCookie(setCookie);
        if (csrf) {
          cap.csrf = csrf;
          if (!cap.cookie?.includes("bff_sid")) {
            cap.cookie = setCookie.split(/,(?=\s*\w+=)/).join("; ");
          }
          persist();
        }
      }
    }
  });

  ws.on("close", () => {
    pageSockets.delete(wsUrl);
  });

  ws.on("error", () => {
    pageSockets.delete(wsUrl);
  });
}

async function anexarTodasAbas(): Promise<void> {
  for (const tab of await listarAbas()) {
    anexarAba(tab);
  }
}

async function colherCookiesViaCdp(): Promise<void> {
  if (captured()) return;
  const tab =
    (await listarAbas()).find((t) => /pedagiodigital\.com/i.test(t.url ?? "")) ??
    (await listarAbas())[0];
  if (!tab?.webSocketDebuggerUrl) return;

  await new Promise<void>((resolve) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl!);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, 3000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Network.getCookies",
          params: {
            urls: ["https://pedagiodigital.com", "https://www.pedagiodigital.com"],
          },
        }),
      );
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let msg: { id?: number; result?: { cookies?: CdpCookie[] } };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id === 1 && msg.result?.cookies?.length) {
        montarSessaoDeCookies(msg.result.cookies);
      }
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    });

    ws.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function navegarPrimeiraAba(url: string): Promise<void> {
  const tabs = await listarAbas();
  const tab = tabs.find((t) => t.url && t.url !== "about:blank") ?? tabs[0];
  if (!tab?.webSocketDebuggerUrl) return;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl!);
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } }));
    });
    ws.on("error", reject);
    setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, 800);
  });
}

async function abrirChrome(): Promise<void> {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const child = spawn(
    acharChrome(),
    [
      `--remote-debugging-port=${PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${USER_DATA_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      PORTAL,
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  await esperarDevtools();
  await new Promise((r) => setTimeout(r, 800));
}

function fecharSockets(): void {
  for (const ws of pageSockets.values()) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  pageSockets.clear();
}

async function main(): Promise<void> {
  const jaAberto = await devtoolsUp();
  if (!jaAberto) {
    await abrirChrome();
  } else {
    console.log(`Chrome CDP já activo na porta ${PORT} — a navegar sem abrir popup.`);
    await navegarPrimeiraAba(PORTAL);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("Chrome (janela dedicada) aberto. Faça login no pedagiodigital.com (CPF/senha + reCAPTCHA).");
  console.log(
    "Após entrar, aguarde a lista de placas carregar (F5 se necessário). Capturo cookie + CSRF e fecho o Chrome.",
  );

  await anexarTodasAbas();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, TIMEOUT_MS);
    let devtoolsFails = 0;
    const poll = setInterval(() => {
      void anexarTodasAbas();
      void colherCookiesViaCdp();
      if (captured()) {
        clearInterval(poll);
        clearTimeout(timer);
        console.log("Sessão capturada (cookie + CSRF).");
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

  fecharSockets();
  if (captured()) {
    await fecharChromeCdp(PORT, keepOpen);
  }
  console.log(`FIM. sessão=${captured() ? "OK" : "não capturada"}`);
  if (!captured()) {
    console.log(
      "Dica: confirme que entrou no portal e a lista de placas carregou. Se persistir, rode com -Fresh: .\\scripts\\login-pedagio.ps1 -Fresh",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
