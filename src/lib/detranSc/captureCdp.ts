/**
 * Captura passiva do JWT DETRAN SC via Chrome real + CDP (Network).
 * Grava automaticamente em sessionStore quando detecta Authorization.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import {
  abrirAbaPortalCdp,
  CHROME_PORTAL_ARGS,
  navegarPrimeiraAbaCdp,
  obterBrowserWsPortal,
} from "../cdp/portalChrome.js";
import { REPO_ROOT } from "../repoRoot.js";
import { clearDetranScRuntimeSession } from "./auth.js";
import { saveDetranScSession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.DETRAN_SC_CDP_PORT ?? "9223");
const PORTAL = "https://servicos.detran.sc.gov.br/";
const PORTAL_HOST_RE = /detran\.sc\.gov\.br|acesso\.gov\.br|ciasc\.sc\.gov\.br/i;
const API_HOST = "backend.detran.sc.gov.br";
const CAPTURE_TIMEOUT_MS = 15 * 60 * 1000;

const PROFILE_DIR =
  process.env.DETRAN_SC_CHROME_PROFILE?.trim() ||
  path.join(REPO_ROOT, ".cache", "detran-sc", "chrome-profile");

const CHROME_CANDS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
];

export type DetranScCaptureStatus =
  | "idle"
  | "starting"
  | "waiting"
  | "captured"
  | "error"
  | "unavailable";

export type DetranScCaptureState = {
  status: DetranScCaptureStatus;
  message?: string;
  startedAt?: string;
  capturedAt?: string;
  available: boolean;
};

type Cap = { auth?: string; empresa?: string; appVersion?: string };

export type DetranScCapturedSession = {
  auth: string;
  empresa: string;
  appVersion?: string | null;
};

export type DetranScCaptureStartOpts = {
  /** Se definido, grava a sessão via este callback (ex.: API remota Vercel). */
  persist?: (session: DetranScCapturedSession) => Promise<void>;
};

let state: DetranScCaptureState = { status: "idle", available: isDetranScCaptureAvailable() };
let ws: WebSocket | null = null;
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Cap = {};
let persistFn: DetranScCaptureStartOpts["persist"] | null = null;
const pendingRequestUrls = new Map<string, string>();

export function isDetranScCaptureAvailable(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.DETRAN_SC_CAPTURE_DISABLED === "1") return false;
  return process.platform === "win32";
}

export function getDetranScCaptureState(): DetranScCaptureState {
  return { ...state, available: isDetranScCaptureAvailable() };
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

async function devtoolsUp(): Promise<string | undefined> {
  const info = await obterBrowserWsPortal(DEBUG_PORT, PORTAL_HOST_RE);
  if (info.wrongPortal) {
    throw new Error(
      `Porta CDP ${DEBUG_PORT} está em uso por outro portal. Feche esse Chrome ou defina DETRAN_SC_CDP_PORT.`,
    );
  }
  return info.wsUrl;
}

async function esperarDevtools(): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const url = await devtoolsUp();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Chrome DevTools não respondeu — verifique se o Chrome está instalado.");
}

async function abrirChrome(): Promise<string> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const chrome = acharChrome();
  chromeChild = spawn(
    chrome,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      ...CHROME_PORTAL_ARGS,
      `--user-data-dir=${PROFILE_DIR}`,
      PORTAL,
    ],
    { detached: true, stdio: "ignore" },
  );
  chromeChild.unref();
  const wsUrl = await esperarDevtools();
  await new Promise((r) => setTimeout(r, 800));
  return wsUrl;
}

async function garantirPortalAberto(wsUrl: string): Promise<void> {
  await abrirAbaPortalCdp(wsUrl, PORTAL);
  await new Promise((r) => setTimeout(r, 600));
  await navegarPrimeiraAbaCdp(DEBUG_PORT, PORTAL);
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
  if (!cap.auth || !cap.empresa || !isLikelyJwt(cap.auth)) return;

  const session: DetranScCapturedSession = {
    auth: jwtSemBearer(cap.auth),
    empresa: cap.empresa,
    appVersion: cap.appVersion ?? null,
  };

  if (persistFn) {
    await persistFn(session);
  } else {
    await saveDetranScSession(session);
  }
  clearDetranScRuntimeSession();

  state = {
    status: "captured",
    available: isDetranScCaptureAvailable(),
    message: persistFn
      ? "Sessão DETRAN SC capturada e enviada para a API remota."
      : "Sessão DETRAN SC capturada e guardada automaticamente.",
    startedAt: state.startedAt,
    capturedAt: new Date().toISOString(),
  };
  await stopDetranScCapture(false);
}

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(API_HOST)) return;

  const auth = lerHeader(headers, "authorization");
  if (auth && /^Bearer\s/i.test(auth)) {
    cap.auth = auth;
    const emp = lerHeader(headers, "x-empresa");
    const ver = lerHeader(headers, "x-app-version");
    if (emp) cap.empresa = emp;
    if (ver) cap.appVersion = ver;
    if (cap.auth && cap.empresa && isLikelyJwt(cap.auth)) {
      void persistCapture().catch((err) => {
        state = {
          status: "error",
          available: isDetranScCaptureAvailable(),
          message: err instanceof Error ? err.message : String(err),
          startedAt: state.startedAt,
        };
      });
    }
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

export async function startDetranScCapture(
  opts?: DetranScCaptureStartOpts,
): Promise<DetranScCaptureState> {
  if (!isDetranScCaptureAvailable()) {
    state = {
      status: "unavailable",
      available: false,
      message:
        "Captura automática só funciona com a API no Windows (Chrome local). Na Vercel, use o bridge local (`npm run detran-capture-bridge`) ou variáveis DETRAN_SC_*.",
    };
    return getDetranScCaptureState();
  }

  if (state.status === "starting" || state.status === "waiting") {
    return getDetranScCaptureState();
  }

  cap = {};
  persistFn = opts?.persist ?? null;
  pendingRequestUrls.clear();
  cleanupTimers();

  state = {
    status: "starting",
    available: true,
    message: "A abrir Chrome no portal DETRAN SC…",
    startedAt: new Date().toISOString(),
  };

  try {
    let wsUrl = await devtoolsUp();
    if (!wsUrl) {
      wsUrl = await abrirChrome();
    } else {
      await garantirPortalAberto(wsUrl);
    }

    ws = new WebSocket(wsUrl);
    attachNetworkListener(ws);

    state = {
      status: "waiting",
      available: true,
      message:
        "Chrome aberto no portal DETRAN SC. Clique em Entrar com gov.br, faça login (certificado A1) e consulte um veículo — o token será capturado sozinho.",
      startedAt: state.startedAt,
    };

    timeoutTimer = setTimeout(() => {
      if (state.status === "waiting") {
        state = {
          status: "error",
          available: true,
          message: "Tempo esgotado (15 min) — login ou consulta não detectados.",
          startedAt: state.startedAt,
        };
        void stopDetranScCapture(false);
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
          void stopDetranScCapture(false);
        }
      });
    }, 4000);
  } catch (err) {
    state = {
      status: "error",
      available: isDetranScCaptureAvailable(),
      message: err instanceof Error ? err.message : String(err),
      startedAt: state.startedAt,
    };
    await stopDetranScCapture(false);
  }

  return getDetranScCaptureState();
}

export async function stopDetranScCapture(resetIdle = true): Promise<DetranScCaptureState> {
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
    state = { status: "idle", available: isDetranScCaptureAvailable() };
  } else if (state.status === "captured") {
    state = { ...state, available: isDetranScCaptureAvailable() };
  }

  return getDetranScCaptureState();
}
