/**
 * Captura passiva da sessão DETRAN RS via Chrome real + CDP (browser root + auto-attach).
 * O padrão auto-attach captura pedidos em iframes/workers (Gov.br → PROCERGS).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { obterBrowserWsPortal } from "../cdp/portalChrome.js";
import { cdpKeepOpen, fecharChromeCdp } from "../cdp/fecharChromeCdp.js";
import { REPO_ROOT } from "../repoRoot.js";
import { clearDetranRsRuntimeSession } from "./auth.js";
import { saveDetranRsSession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.DETRAN_RS_CDP_PORT ?? "9227");
const PORTAL = "https://pcsdetran.rs.gov.br/";
const PORTAL_HOST_RE = /pcsdetran\.(rs\.gov\.br|procergs\.com\.br)/i;
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
let ws: WebSocket | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Partial<Cap> = {};
let persistFn: DetranRsCaptureStartOpts["persist"] | null = null;
let persisting = false;
const pendingRequestUrls = new Map<string, string>();

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

async function esperarDevtools(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const info = await obterBrowserWsPortal(DEBUG_PORT, PORTAL_HOST_RE);
    if (info.wsUrl && !info.wrongPortal) return info.wsUrl;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Chrome DevTools não respondeu — verifique se o Chrome está instalado.");
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

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(API_HOST)) return;

  const auth = lerHeader(headers, "authorization");
  const userId = lerHeader(headers, "x-user-id");
  if (auth && /^Bearer\s/i.test(auth)) cap.auth = auth;
  if (userId?.trim()) cap.userId = userId.trim();
  if (sessaoCompleta(cap)) void persistCapture().catch(() => {});
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
      const requestId = msg.params?.requestId as string | undefined;
      const req = msg.params?.request as { url?: string; headers?: Record<string, string> } | undefined;
      if (requestId && req?.url) pendingRequestUrls.set(requestId, req.url);
      if (req?.url) tratarRequest(req.url, req.headers ?? {});
    } else if (msg.method === "Network.requestWillBeSentExtraInfo") {
      const requestId = msg.params?.requestId as string | undefined;
      const url = requestId ? pendingRequestUrls.get(requestId) : undefined;
      const headers = msg.params?.headers as Record<string, string> | undefined;
      if (url && headers) tratarRequest(url, headers);
      if (requestId) pendingRequestUrls.delete(requestId);
    }
  });
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
  pendingRequestUrls.clear();
  cleanupTimers();

  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal DETRAN RS…",
    startedAt: new Date().toISOString(),
  };

  try {
    const chromeInfo = await obterBrowserWsPortal(DEBUG_PORT, PORTAL_HOST_RE);
    let wsUrl = chromeInfo.wsUrl;

    if (chromeInfo.wrongPortal) {
      throw new Error(
        `Porta CDP ${DEBUG_PORT} está em uso por outro portal. Feche esse Chrome ou defina DETRAN_RS_CDP_PORT.`,
      );
    }

    if (!wsUrl) {
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
      wsUrl = await esperarDevtools();
    }

    ws = new WebSocket(wsUrl);
    attachNetworkListener(ws);

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

    pollTimer = setInterval(() => {
      if (sessaoCompleta(cap) && state.status === "waiting") {
        void persistCapture().catch(() => {});
      }
      fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).catch(() => {
        if (state.status === "waiting") {
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
  pendingRequestUrls.clear();
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  chromeChild = null;

  if (state.status === "captured" && !keepChromeOpen) {
    await fecharChromeCdp(DEBUG_PORT, false);
  }

  if (resetIdle && state.status !== "captured") {
    state = { status: "idle", available: isDetranRsCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isDetranRsCaptureAvailable() };
  }

  return getDetranRsCaptureState();
}
