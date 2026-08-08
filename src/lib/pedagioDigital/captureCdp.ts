/**
 * Captura passiva da sessão Pedágio Digital via Chrome real + CDP (Network).
 * Liga-se a cada aba (não ao browser root) para evitar "Debugger is paused".
 * Grava cookie (bff_sid) + CSRF automaticamente (store local ou callback para API remota).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { cdpKeepOpen, fecharChromeCdp } from "../cdp/fecharChromeCdp.js";
import { REPO_ROOT } from "../repoRoot.js";
import { clearPedagioSession } from "./auth.js";
import { savePedagioSession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.PEDAGIO_CDP_PORT ?? "9225");
const PORTAL = "https://pedagiodigital.com/";
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;
const keepChromeOpen =
  cdpKeepOpen() || process.env.PEDAGIO_CDP_KEEP_OPEN === "1";

const PROFILE_DIR =
  process.env.PEDAGIO_CHROME_PROFILE?.trim() ||
  path.join(REPO_ROOT, ".cache", "pedagio-digital", "chrome-profile");

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

const COOKIE_URLS = [
  "https://pedagiodigital.com",
  "https://www.pedagiodigital.com",
];

type TabTarget = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

export type PedagioCaptureStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "captured"
  | "error"
  | "unavailable";

export type PedagioCaptureState = {
  status: PedagioCaptureStatus;
  message?: string;
  startedAt?: string;
  capturedAt?: string;
  available: boolean;
};

export type PedagioCapturedSession = {
  cookie?: string;
  csrf?: string;
};

export type PedagioCaptureStartOpts = {
  persist?: (session: PedagioCapturedSession) => Promise<void>;
};

type Cap = PedagioCapturedSession;

type CdpCookie = { name: string; value: string };

let state: PedagioCaptureState = { status: "idle", available: isPedagioCaptureAvailable() };
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Cap = {};
let persistFn: PedagioCaptureStartOpts["persist"] | null = null;
let persisting = false;
const pageSockets = new Map<string, WebSocket>();

export function isPedagioCaptureAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.PEDAGIO_CAPTURE_DISABLED === "1") return false;
  return process.platform === "win32";
}

export function getPedagioCaptureState(): PedagioCaptureState {
  return { ...state, available: isPedagioCaptureAvailable() };
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

function hostOk(url: string): boolean {
  try {
    return /(^|\.)pedagiodigital\.com$/i.test(new URL(url).hostname);
  } catch {
    return /pedagiodigital\.com/i.test(url);
  }
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

function sessaoCompleta(c: Cap): boolean {
  return Boolean(c.cookie?.includes("bff_sid") && c.csrf?.trim());
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
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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

  const session: PedagioCapturedSession = {
    cookie: cap.cookie,
    csrf: cap.csrf,
  };

  try {
    if (persistFn) {
      await persistFn(session);
    } else {
      await savePedagioSession({
        cookie: session.cookie!,
        csrf: session.csrf!,
      });
    }
    clearPedagioSession();

    state = {
      status: "captured",
      available: isPedagioCaptureAvailable(),
      message: persistFn
        ? "Sessão Pedágio Digital capturada e enviada para a API remota."
        : "Sessão Pedágio Digital capturada e guardada automaticamente.",
      startedAt: state.startedAt,
      capturedAt: new Date().toISOString(),
    };
    fecharSockets();
    await fecharChromeCdp(DEBUG_PORT, keepChromeOpen);
    await stopPedagioCapture(false);
  } catch (err) {
    persisting = false;
    state = {
      status: "error",
      available: isPedagioCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    throw err;
  }
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!hostOk(url)) return;

  const cookie = lerHeader(headers, "cookie");
  if (!cookie?.includes("bff_sid")) return;
  const csrf = lerHeader(headers, "x-csrf-token") || csrfFromCookie(cookie);
  if (!csrf) return;
  cap.cookie = cookie;
  cap.csrf = csrf;
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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

async function colherCookiesViaCdp(): Promise<void> {
  if (state.status === "captured" || sessaoCompleta(cap)) return;
  const tabs = await listarAbas();
  const tab =
    tabs.find((t) => /pedagiodigital\.com/i.test(t.url ?? "")) ?? tabs[0];
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
      const setCookie = headers ? lerHeader(headers, "set-cookie") : undefined;
      if (setCookie?.includes("bff_sid")) {
        const csrf = csrfFromCookie(setCookie);
        if (csrf) {
          cap.csrf = csrf;
          if (!cap.cookie?.includes("bff_sid")) {
            cap.cookie = setCookie.split(/,(?=\s*\w+=)/).join("; ");
          }
          if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
        }
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

export async function startPedagioCapture(
  opts?: PedagioCaptureStartOpts,
): Promise<PedagioCaptureState> {
  if (!isPedagioCaptureAvailable()) {
    state = {
      status: "unavailable",
      available: false,
      message:
        "Captura automática só funciona com bridge local no Windows. Na Vercel a API não abre Chrome.",
    };
    return getPedagioCaptureState();
  }

  if (state.status === "starting" || state.status === "waiting") {
    return getPedagioCaptureState();
  }

  cap = {};
  persisting = false;
  persistFn = opts?.persist ?? null;
  cleanupTimers();
  fecharSockets();

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal Pedágio Digital…",
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
        "Chrome aberto. Faça login no pedagiodigital.com (CPF/senha + reCAPTCHA) — ao capturar cookie + CSRF, o Chrome fecha sozinho.",
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
          void stopPedagioCapture(false);
        }
      }
    }, CAPTURE_TIMEOUT_MS);

    let devtoolsFails = 0;
    pollTimer = setInterval(() => {
      void anexarTodasAbas();
      void colherCookiesViaCdp();
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
            void stopPedagioCapture(false);
          }
        });
    }, 1500);
  } catch (err) {
    state = {
      status: "error",
      available: isPedagioCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    await stopPedagioCapture(false);
  }

  return getPedagioCaptureState();
}

export async function stopPedagioCapture(resetIdle = true): Promise<PedagioCaptureState> {
  cleanupTimers();
  persistFn = null;
  fecharSockets();
  chromeChild = null;

  if (resetIdle && state.status !== "captured") {
    state = { status: "idle", available: isPedagioCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isPedagioCaptureAvailable() };
  }

  return getPedagioCaptureState();
}
