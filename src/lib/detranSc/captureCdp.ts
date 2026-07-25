/**
 * Captura passiva do JWT DETRAN SC via Chrome real + CDP (Network).
 * Grava automaticamente em sessionStore quando detecta Authorization.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";

import { REPO_ROOT } from "../repoRoot.js";
import { clearDetranScRuntimeSession } from "./auth.js";
import { saveDetranScSession } from "./sessionStore.js";

const DEBUG_PORT = Number(process.env.DETRAN_SC_CDP_PORT ?? "9223");
const PORTAL = "https://servicos.detran.sc.gov.br/";
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

let state: DetranScCaptureState = { status: "idle", available: isDetranScCaptureAvailable() };
let ws: WebSocket | null = null;
let chromeChild: ChildProcess | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cap: Cap = {};

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
  if (!cap.auth || !cap.empresa || !isLikelyJwt(cap.auth)) return;

  await saveDetranScSession({
    auth: jwtSemBearer(cap.auth),
    empresa: cap.empresa,
    appVersion: cap.appVersion ?? null,
  });
  clearDetranScRuntimeSession();

  state = {
    status: "captured",
    available: isDetranScCaptureAvailable(),
    message: "Sessão DETRAN SC capturada e guardada automaticamente.",
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
      const req = msg.params?.request as { url?: string; headers?: Record<string, string> } | undefined;
      if (req?.url) tratarRequest(req.url, req.headers ?? {});
    }
  });
}

export async function startDetranScCapture(): Promise<DetranScCaptureState> {
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
    } else {
      try {
        await fetch(PORTAL).catch(() => {});
      } catch {
        /* ignore */
      }
    }

    ws = new WebSocket(wsUrl);
    attachNetworkListener(ws);

    state = {
      status: "waiting",
      available: true,
      message:
        "Chrome aberto. Faça login Gov.br (certificado A1 costuma ser automático) e consulte um veículo — o token será capturado sozinho.",
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
