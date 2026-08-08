/**
 * Captura passiva da sessão SigaPay via Chrome real + CDP (Network).
 * Liga-se a cada aba (não ao browser root) para evitar "Debugger is paused".
 * Grava cookie/token automaticamente (store local ou callback para API remota).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { cdpKeepOpen, fecharChromeCdp } from "../cdp/fecharChromeCdp.js";
import { REPO_ROOT } from "../repoRoot.js";
import { clearSigapaySession, SIGAPAY_ORIGIN } from "./auth.js";
import { saveSigapaySession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.SIGAPAY_CDP_PORT ?? "9224");
const PORTAL = SIGAPAY_ORIGIN;
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;
const keepChromeOpen =
  cdpKeepOpen() || process.env.SIGAPAY_CDP_KEEP_OPEN === "1";

const PROFILE_DIR =
  process.env.SIGAPAY_CHROME_PROFILE?.trim() ||
  path.join(REPO_ROOT, ".cache", "sigapay", "chrome-profile");

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

export type SigapayCaptureStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "captured"
  | "error"
  | "unavailable";

export type SigapayCaptureState = {
  status: SigapayCaptureStatus;
  message?: string;
  startedAt?: string;
  capturedAt?: string;
  available: boolean;
};

export type SigapayCapturedSession = {
  cookie?: string;
  token?: string;
  apiBase?: string | null;
};

export type SigapayCaptureStartOpts = {
  persist?: (session: SigapayCapturedSession) => Promise<void>;
};

type Cap = SigapayCapturedSession;

let state: SigapayCaptureState = { status: "idle", available: isSigapayCaptureAvailable() };
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Cap = {};
let persistFn: SigapayCaptureStartOpts["persist"] | null = null;
let persisting = false;
const pageSockets = new Map<string, WebSocket>();

export function isSigapayCaptureAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.SIGAPAY_CAPTURE_DISABLED === "1") return false;
  return process.platform === "win32";
}

export function getSigapayCaptureState(): SigapayCaptureState {
  return { ...state, available: isSigapayCaptureAvailable() };
}

function acharChrome(): string {
  for (const c of CHROME_CANDS) if (fs.existsSync(c)) return c;
  return "chrome";
}

function lerHeader(headers: Record<string, string>, nome: string): string | undefined {
  const alvo = nome.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === alvo) return v;
  }
  return undefined;
}

function tokenLimpo(auth: string): string {
  return auth.replace(/^Bearer\s+/i, "").trim();
}

function hostOk(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("sigapay") ||
      h.includes("zonaazul") ||
      h.includes("zonaazulbrasil")
    );
  } catch {
    return /sigapay|zonaazul/i.test(url);
  }
}

const COOKIE_URLS = [
  "https://sigapay.com.br",
  "https://www.sigapay.com.br",
  "https://zonaazulbrasil.com.br",
  "https://www.zonaazulbrasil.com.br",
];

type CdpCookie = { name: string; value: string; domain?: string };

function cookieAnalytics(name: string): boolean {
  return /^(_ga|_gid|_cl|_gcl|_fbp|RT$|g_state)/i.test(name);
}

function montarCookieHeader(cookies: CdpCookie[]): string {
  const byName = new Map<string, string>();
  for (const c of cookies) {
    if (!cookieAnalytics(c.name)) byName.set(c.name, c.value);
  }
  return [...byName].map(([k, v]) => `${k}=${v}`).join("; ");
}

function sessaoAutenticada(c: Cap): boolean {
  if (c.token?.trim()) return true;
  const cookie = c.cookie?.trim() ?? "";
  if (!cookie) return false;
  // Sessão real costuma ter mais do que só cookies de analytics.
  const pairs = cookie.split(";").map((p) => p.trim()).filter(Boolean);
  return pairs.some((p) => {
    const name = p.split("=")[0]?.trim() ?? "";
    return name && !cookieAnalytics(name);
  });
}

function sessaoCompleta(c: Cap): boolean {
  return sessaoAutenticada(c);
}

async function devtoolsUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function listarAbas(): Promise<TabTarget[]> {
  try {
    const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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
  throw new Error("Chrome DevTools não respondeu — verifique se o Chrome está instalado.");
}

function cleanupTimers(): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function fecharSockets(): void {
  for (const socket of pageSockets.values()) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
  pageSockets.clear();
}

async function persistCapture(): Promise<void> {
  if (persisting || state.status === "captured") return;
  if (!sessaoCompleta(cap)) return;
  persisting = true;

  const session: SigapayCapturedSession = {
    cookie: cap.cookie,
    token: cap.token,
    apiBase: cap.apiBase ?? null,
  };

  try {
    if (persistFn) {
      await persistFn(session);
    } else {
      await saveSigapaySession(session);
    }
    clearSigapaySession();

    state = {
      status: "captured",
      available: isSigapayCaptureAvailable(),
      message: persistFn
        ? "Sessão SigaPay capturada e enviada para a API remota."
        : "Sessão SigaPay capturada e guardada automaticamente.",
      startedAt: state.startedAt,
      capturedAt: new Date().toISOString(),
    };
    fecharSockets();
    await fecharChromeCdp(DEBUG_PORT, keepChromeOpen);
    await stopSigapayCapture(false);
  } catch (err) {
    persisting = false;
    state = {
      status: "error",
      available: isSigapayCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    throw err;
  }
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!hostOk(url)) return;

  const cookie = lerHeader(headers, "cookie");
  const auth = lerHeader(headers, "authorization");
  if (cookie?.trim()) cap.cookie = cookie.trim();
  if (auth?.trim()) cap.token = tokenLimpo(auth);

  try {
    const u = new URL(url);
    if (u.pathname.includes("/api") || /Aviso|Placa|Veiculo/i.test(u.pathname)) {
      cap.apiBase = `${u.origin}/api`;
    }
  } catch {
    /* ignore */
  }

  const looksApi =
    /\/api\b/i.test(url) ||
    /Aviso|Placa|Veiculo|list-logado|auth|login|usuario|sessao/i.test(url) ||
    Boolean(auth);

  if (looksApi && sessaoCompleta(cap)) {
    void persistCapture().catch(() => {});
  }
}

function tratarAssociatedCookies(
  associated: Array<{ cookie?: CdpCookie }> | undefined,
): void {
  if (!associated?.length) return;
  const cookies = associated.map((a) => a.cookie).filter(Boolean) as CdpCookie[];
  if (!cookies.length) return;
  const header = montarCookieHeader(cookies);
  if (header) cap.cookie = header;
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
}

function tratarResponseCookies(cookies: CdpCookie[] | undefined): void {
  if (!cookies?.length) return;
  const header = montarCookieHeader(cookies);
  if (header) cap.cookie = header;
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
}

async function colherCookiesViaCdp(): Promise<void> {
  if (state.status === "captured" || sessaoCompleta(cap)) return;
  const tabs = await listarAbas();
  const tab =
    tabs.find((t) => /sigapay|zonaazul/i.test(t.url ?? "")) ?? tabs[0];
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
          params: { urls: COOKIE_URLS },
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
        const header = montarCookieHeader(msg.result.cookies);
        if (header) cap.cookie = header;
        if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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

async function colherTokenStorage(): Promise<void> {
  if (state.status === "captured" || cap.token?.trim()) return;
  const tabs = await listarAbas();
  const tab = tabs.find((t) => /sigapay|zonaazul/i.test(t.url ?? ""));
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

    const expr = `(() => {
      const keys = ["token","accessToken","authToken","jwt","authorization","userToken","idToken","bearer"];
      for (const store of [localStorage, sessionStorage]) {
        for (const k of keys) {
          const v = store.getItem(k);
          if (v && v.length > 20) return v;
        }
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (!k || !/token|auth|jwt|bearer/i.test(k)) continue;
          const v = store.getItem(k);
          if (v && v.length > 20) return v;
        }
      }
      return null;
    })()`;

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: expr, returnByValue: true },
        }),
      );
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let msg: { id?: number; result?: { result?: { value?: string } } };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      const token = msg.result?.result?.value;
      if (typeof token === "string" && token.length > 20) {
        cap.token = tokenLimpo(token);
        if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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

function anexarAba(tab: TabTarget): void {
  const wsUrl = tab.webSocketDebuggerUrl!;
  if (pageSockets.has(wsUrl)) return;

  const socket = new WebSocket(wsUrl);
  pageSockets.set(wsUrl, socket);
  let msgId = 1;

  socket.on("open", () => {
    socket.send(JSON.stringify({ id: msgId++, method: "Network.enable", params: {} }));
  });

  socket.on("message", (data: WebSocket.RawData) => {
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
      const auth = headers ? lerHeader(headers, "authorization") : undefined;
      if (auth?.trim()) {
        cap.token = tokenLimpo(auth);
        if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
      }
    }
  });

  socket.on("close", () => {
    pageSockets.delete(wsUrl);
  });

  socket.on("error", () => {
    pageSockets.delete(wsUrl);
  });
}

async function anexarTodasAbas(): Promise<void> {
  for (const tab of await listarAbas()) {
    anexarAba(tab);
  }
}

async function navegarPrimeiraAba(url: string): Promise<void> {
  const tabs = await listarAbas();
  const tab = tabs.find((t) => t.url && t.url !== "about:blank") ?? tabs[0];
  if (!tab?.webSocketDebuggerUrl) return;

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(tab.webSocketDebuggerUrl!);
    socket.on("open", () => {
      socket.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } }));
    });
    socket.on("error", reject);
    setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, 800);
  });
}

async function abrirChrome(): Promise<void> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  chromeChild = spawn(
    acharChrome(),
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      PORTAL,
    ],
    { detached: true, stdio: "ignore" },
  );
  chromeChild.unref();
  await esperarDevtools();
  await new Promise((r) => setTimeout(r, 800));
}

export async function startSigapayCapture(
  opts?: SigapayCaptureStartOpts,
): Promise<SigapayCaptureState> {
  if (!isSigapayCaptureAvailable()) {
    state = {
      status: "unavailable",
      available: false,
      message:
        "Captura automática só funciona com bridge local no Windows (`npm run sigapay-capture-bridge`). Na Vercel a API não abre Chrome.",
    };
    return getSigapayCaptureState();
  }

  if (state.status === "starting" || state.status === "waiting") {
    return getSigapayCaptureState();
  }

  cap = {};
  persisting = false;
  persistFn = opts?.persist ?? null;
  cleanupTimers();
  fecharSockets();

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal SigaPay…",
    startedAt: new Date().toISOString(),
  };

  try {
    const jaAberto = await devtoolsUp();
    if (!jaAberto) {
      await abrirChrome();
    } else {
      await navegarPrimeiraAba(PORTAL);
      await new Promise((r) => setTimeout(r, 500));
    }

    await anexarTodasAbas();

    state = {
      status: "waiting",
      available: true,
      message:
        "Chrome aberto. Faça login no SigaPay e abra avisos/placas — ao capturar, o Chrome fecha sozinho.",
      startedAt: state.startedAt,
    };

    timeoutTimer = setTimeout(() => {
      if (state.status === "waiting") {
        if (sessaoCompleta(cap)) {
          void persistCapture().catch(() => {});
        } else {
          state = {
            status: "error",
            available: true,
            message: "Tempo esgotado (15 min) — login ou navegação não detectados.",
            startedAt: state.startedAt,
          };
          void stopSigapayCapture(false);
        }
      }
    }, CAPTURE_TIMEOUT_MS);

    let devtoolsFails = 0;
    pollTimer = setInterval(() => {
      void anexarTodasAbas();
      void colherCookiesViaCdp();
      void colherTokenStorage();
      if (sessaoCompleta(cap) && state.status === "waiting") {
        void persistCapture().catch(() => {});
      }
      fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
        .then((r) => {
          if (r.ok) devtoolsFails = 0;
        })
        .catch(() => {
          devtoolsFails++;
          if (devtoolsFails >= 3 && state.status === "waiting") {
            state = {
              status: "error",
              available: true,
              message: "Chrome fechado antes da captura.",
              startedAt: state.startedAt,
            };
            void stopSigapayCapture(false);
          }
        });
    }, 1500);
  } catch (err) {
    state = {
      status: "error",
      available: isSigapayCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    await stopSigapayCapture(false);
  }

  return getSigapayCaptureState();
}

export async function stopSigapayCapture(resetIdle = true): Promise<SigapayCaptureState> {
  cleanupTimers();
  persistFn = null;
  fecharSockets();
  chromeChild = null;

  if (resetIdle && state.status !== "captured") {
    state = { status: "idle", available: isSigapayCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isSigapayCaptureAvailable() };
  }

  return getSigapayCaptureState();
}
