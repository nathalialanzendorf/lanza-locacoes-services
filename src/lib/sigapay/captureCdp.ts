/**
 * Captura passiva da sessão SigaPay via Chrome real + CDP (Network).
 * Grava cookie/token automaticamente (store local ou callback para API remota).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { REPO_ROOT } from "../repoRoot.js";
import { clearSigapaySession, SIGAPAY_ORIGIN } from "./auth.js";
import { saveSigapaySession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.SIGAPAY_CDP_PORT ?? "9224");
const PORTAL = SIGAPAY_ORIGIN;
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;

const PROFILE_DIR =
  process.env.SIGAPAY_CHROME_PROFILE?.trim() ||
  path.join(REPO_ROOT, ".cache", "sigapay", "chrome-profile");

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

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
let ws: WebSocket | null = null;
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Cap = {};
let persistFn: SigapayCaptureStartOpts["persist"] | null = null;

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
    return h.includes("sigapay") || h.includes("zonaazul");
  } catch {
    return url.toLowerCase().includes("sigapay");
  }
}

function sessaoCompleta(c: Cap): boolean {
  return Boolean(c.cookie?.trim() || c.token?.trim());
}

async function devtoolsUp(): Promise<string | undefined> {
  try {
    const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
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

async function persistCapture(): Promise<void> {
  if (!sessaoCompleta(cap)) return;

  const session: SigapayCapturedSession = {
    cookie: cap.cookie,
    token: cap.token,
    apiBase: cap.apiBase ?? null,
  };

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
  await stopSigapayCapture(false);
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
    /\/api\//i.test(url) ||
    /Aviso|Placa|Veiculo|list-logado/i.test(url) ||
    Boolean(auth);

  if (looksApi && sessaoCompleta(cap)) {
    void persistCapture().catch((err) => {
      state = {
        status: "error",
        available: isSigapayCaptureAvailable(),
        message: err instanceof Error ? err.message : String(err),
        startedAt: state.startedAt,
      };
    });
  }
}

function attachNetworkListener(socket: WebSocket): void {
  let msgId = 1;
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
    socket.send(JSON.stringify({ id: msgId++, method, params, sessionId }));
  };

  socket.on("open", () => {
    send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    send("Network.enable");
  });

  socket.on("message", (data: WebSocket.RawData) => {
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
  persistFn = opts?.persist ?? null;
  cleanupTimers();

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal SigaPay…",
    startedAt: new Date().toISOString(),
  };

  try {
    let wsUrl = await devtoolsUp();
    if (!wsUrl) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
      const chrome = acharChrome();
      chromeChild = spawn(
        chrome,
        [
          `--remote-debugging-port=${DEBUG_PORT}`,
          `--user-data-dir=${PROFILE_DIR}`,
          "--no-first-run",
          "--no-default-browser-check",
          PORTAL,
        ],
        { detached: true, stdio: "ignore" },
      );
      chromeChild.unref();
      wsUrl = await esperarDevtools();
    }

    ws = new WebSocket(wsUrl);
    attachNetworkListener(ws);

    state = {
      status: "waiting",
      available: true,
      message:
        "Chrome aberto. Faça login no SigaPay e abra avisos/placas — a sessão será capturada sozinha.",
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

    pollTimer = setInterval(() => {
      fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).catch(() => {
        if (state.status === "waiting") {
          state = {
            status: "error",
            available: true,
            message: "Chrome fechado antes da captura.",
            startedAt: state.startedAt,
          };
          void stopSigapayCapture(false);
        }
      });
    }, 4000);
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
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  chromeChild = null;

  if (resetIdle && state.status !== "captured") {
    state = { status: "idle", available: isSigapayCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isSigapayCaptureAvailable() };
  }

  return getSigapayCaptureState();
}
