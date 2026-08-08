/**
 * Captura passiva da sessão DETRAN RS via Chrome real + CDP (Network por aba).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { cdpKeepOpen, fecharChromeCdp } from "../cdp/fecharChromeCdp.js";
import { REPO_ROOT } from "../repoRoot.js";
import { clearDetranRsRuntimeSession } from "./auth.js";
import { saveDetranRsSession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.DETRAN_RS_CDP_PORT ?? "9226");
const PORTAL = "https://pcsdetran.rs.gov.br/";
const API_HOST = "pcsdetran.procergs.com.br";
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;
const keepChromeOpen =
  cdpKeepOpen() || process.env.DETRAN_RS_CDP_KEEP_OPEN === "1";

const PROFILE_DIR =
  process.env.DETRAN_RS_CHROME_PROFILE?.trim() ||
  path.join(REPO_ROOT, ".cache", "detran-rs", "chrome-profile");

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

export type DetranRsCaptureStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "captured"
  | "error"
  | "unavailable";

export type DetranRsCaptureState = {
  status: DetranRsCaptureStatus;
  message?: string;
  startedAt?: string;
  capturedAt?: string;
  available: boolean;
};

export type DetranRsCapturedSession = {
  auth: string;
  userId: string;
};

export type DetranRsCaptureStartOpts = {
  persist?: (session: DetranRsCapturedSession) => Promise<void>;
};

type Cap = DetranRsCapturedSession;

let state: DetranRsCaptureState = { status: "idle", available: isDetranRsCaptureAvailable() };
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Partial<Cap> = {};
let persistFn: DetranRsCaptureStartOpts["persist"] | null = null;
let persisting = false;
const pageSockets = new Map<string, WebSocket>();

export function isDetranRsCaptureAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.DETRAN_RS_CAPTURE_DISABLED === "1") return false;
  return process.platform === "win32";
}

export function getDetranRsCaptureState(): DetranRsCaptureState {
  return { ...state, available: isDetranRsCaptureAvailable() };
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

function jwtSemBearer(auth: string): string {
  return auth.replace(/^Bearer\s+/i, "").trim();
}

function isLikelyJwt(auth: string): boolean {
  const jwt = jwtSemBearer(auth);
  const parts = jwt.split(".");
  return parts.length === 3 && jwt.startsWith("eyJ") && jwt.length > 40;
}

function sessaoCompleta(c: Partial<Cap>): c is Cap {
  return Boolean(c.auth?.trim() && c.userId?.trim() && isLikelyJwt(c.auth));
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
  for (const ws of pageSockets.values()) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  pageSockets.clear();
}

async function devtoolsUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function esperarDevtools(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await devtoolsUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Chrome DevTools não respondeu — verifique se o Chrome está instalado.");
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

async function persistCapture(): Promise<void> {
  if (persisting || state.status === "captured") return;
  if (!sessaoCompleta(cap)) return;
  persisting = true;

  const session: DetranRsCapturedSession = {
    auth: jwtSemBearer(cap.auth),
    userId: cap.userId.trim(),
  };

  try {
    if (persistFn) {
      await persistFn(session);
    } else {
      await saveDetranRsSession(session);
    }
    clearDetranRsRuntimeSession();

    state = {
      status: "captured",
      available: isDetranRsCaptureAvailable(),
      message: persistFn
        ? "Sessão DETRAN RS capturada e enviada para a API remota."
        : "Sessão DETRAN RS capturada e guardada automaticamente.",
      startedAt: state.startedAt,
      capturedAt: new Date().toISOString(),
    };
    fecharSockets();
    await fecharChromeCdp(DEBUG_PORT, keepChromeOpen);
    await stopDetranRsCapture(false);
  } catch (err) {
    persisting = false;
    state = {
      status: "error",
      available: isDetranRsCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    throw err;
  }
}

function tratarRequest(_url: string, headers: Record<string, string>): void {
  const auth = lerHeader(headers, "authorization");
  const userId = lerHeader(headers, "x-user-id");
  if (auth && /^Bearer\s/i.test(auth)) cap.auth = auth;
  if (userId?.trim()) cap.userId = userId.trim();
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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
      if (req?.url?.includes(API_HOST)) tratarRequest(req.url, req.headers ?? {});
    }
  });

  socket.on("close", () => pageSockets.delete(wsUrl));
  socket.on("error", () => pageSockets.delete(wsUrl));
}

async function anexarTodasAbas(): Promise<void> {
  for (const tab of await listarAbas()) anexarAba(tab);
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

export async function startDetranRsCapture(
  opts?: DetranRsCaptureStartOpts,
): Promise<DetranRsCaptureState> {
  if (!isDetranRsCaptureAvailable()) {
    state = {
      status: "unavailable",
      available: false,
      message:
        "Captura automática só funciona com bridge local no Windows (`npm run detran-rs-capture-bridge`). Na Vercel a API não abre Chrome.",
    };
    return getDetranRsCaptureState();
  }

  if (state.status === "starting" || state.status === "waiting") {
    return getDetranRsCaptureState();
  }

  cap = {};
  persisting = false;
  persistFn = opts?.persist ?? null;
  cleanupTimers();
  fecharSockets();

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal DETRAN RS…",
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
        "Chrome aberto. Faça login Gov.br no DETRAN RS e consulte um veículo — o token será capturado sozinho.",
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
            message: "Tempo esgotado (15 min) — login ou consulta não detectados.",
            startedAt: state.startedAt,
          };
          void stopDetranRsCapture(false);
        }
      }
    }, CAPTURE_TIMEOUT_MS);

    let devtoolsFails = 0;
    pollTimer = setInterval(() => {
      void anexarTodasAbas();
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
            void stopDetranRsCapture(false);
          }
        });
    }, 1500);
  } catch (err) {
    state = {
      status: "error",
      available: isDetranRsCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    await stopDetranRsCapture(false);
  }

  return getDetranRsCaptureState();
}

export async function stopDetranRsCapture(resetIdle = true): Promise<DetranRsCaptureState> {
  cleanupTimers();
  persistFn = null;
  fecharSockets();
  chromeChild = null;

  if (resetIdle && state.status !== "captured") {
    state = { status: "idle", available: isDetranRsCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isDetranRsCaptureAvailable() };
  }

  return getDetranRsCaptureState();
}
