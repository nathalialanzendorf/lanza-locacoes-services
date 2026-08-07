/**
 * Captura passiva (CDP) do token DETRAN SC a partir de Chrome REAL.
 *
 * Liga-se a cada ABA (nao ao browser root) para evitar o banner
 * "Debugger is paused" que impede o site de carregar.
 *
 * Captura, de chamadas a backend.detran.sc.gov.br/transito-api:
 *   - Authorization (Bearer)  -> DETRAN_SC_AUTH
 *   - X-Empresa               -> DETRAN_SC_EMPRESA
 *   - X-App-Version           -> DETRAN_SC_APP_VERSION
 *
 * Uso: npx tsx scripts/capturarDetranCdp.ts
 *      npx tsx scripts/capturarDetranCdp.ts --url="https://sso.acesso.gov.br/login?..."
 *
 * URL inicial: --url= | DETRAN_SC_LOGIN_URL | servicos.detran.sc.gov.br
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORT = 9222;
const DEFAULT_PORTAL = "https://servicos.detran.sc.gov.br/";
const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice(6)?.trim();
const START_URL = urlArg || process.env.DETRAN_SC_LOGIN_URL?.trim() || DEFAULT_PORTAL;
const API_HOST = "backend.detran.sc.gov.br";
const OUT_FILE = path.join(os.tmpdir(), "detran_capture.json");
const USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR ?? path.join(os.tmpdir(), "lanza_chrome_detran");

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

type Ticket = { placa: string; ticket: string };
const cap: { auth?: string; empresa?: string; appVersion?: string; tickets: Ticket[] } = {
  tickets: [],
};
let authPrinted = false;
let lastPlaca = "";
const pageSockets = new Map<string, WebSocket>();
const keepOpen =
  process.argv.includes("--keep-open") || process.env.DETRAN_CDP_KEEP_OPEN === "1";

function persist(): void {
  fs.writeFileSync(OUT_FILE, JSON.stringify(cap, null, 2), "utf8");
  if (cap.auth && !authPrinted) {
    authPrinted = true;
    console.log(
      `CAPTURA_OK auth=${cap.auth.length}c empresa=${cap.empresa ?? "?"} appVersion=${cap.appVersion ?? "?"} file=${OUT_FILE}`,
    );
  }
}

function captured(): boolean {
  return Boolean(cap.auth && cap.empresa);
}

function acharChrome(): string {
  for (const c of CHROME_CANDS) if (fs.existsSync(c)) return c;
  return "chrome";
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

async function devtoolsUp(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

async function esperarDevtools(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await devtoolsUp()) return;
    await new Promise((res) => setTimeout(res, 500));
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

function tratarRequest(url: string, headers: Record<string, string>): void {
  if (!url.includes(API_HOST)) return;

  const auth = lerHeader(headers, "authorization");
  if (auth && /^Bearer\s/i.test(auth)) {
    cap.auth = auth;
    const emp = lerHeader(headers, "x-empresa");
    const ver = lerHeader(headers, "x-app-version");
    if (emp) cap.empresa = emp;
    if (ver) cap.appVersion = ver;
    persist();
  }

  const mReq = url.match(/\/veiculo\/requisitar-consulta\?[^]*?[?&]p=([A-Za-z0-9-]+)/);
  if (mReq) lastPlaca = mReq[1]!.toUpperCase();

  const mResp = url.match(/\/veiculo\/resposta-consulta\?t=([0-9a-fA-F-]{36})/);
  if (mResp) {
    const ticket = mResp[1]!;
    if (!cap.tickets.some((t) => t.ticket === ticket)) {
      cap.tickets.push({ placa: lastPlaca || "?", ticket });
      console.log(`[ticket] placa=${lastPlaca || "?"} t=${ticket}`);
      persist();
    }
  }
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

async function navegarPrimeiraAba(url: string): Promise<void> {
  const tabs = await listarAbas();
  const tab = tabs[0];
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
      START_URL,
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

/** Fecha o Chrome desta sessao CDP (porta 9222 / perfil DETRAN). */
async function fecharChrome(): Promise<void> {
  if (keepOpen) {
    console.log("Chrome mantido aberto (--keep-open / DETRAN_CDP_KEEP_OPEN=1).");
    return;
  }
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (!r.ok) return;
    const j = (await r.json()) as { webSocketDebuggerUrl?: string };
    if (!j.webSocketDebuggerUrl) return;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(j.webSocketDebuggerUrl!);
      const done = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve();
      };
      ws.on("open", () => {
        ws.send(JSON.stringify({ id: 1, method: "Browser.close", params: {} }));
        setTimeout(done, 600);
      });
      ws.on("error", done);
      setTimeout(done, 2000);
    });
    console.log("Chrome fechado automaticamente.");
  } catch {
    console.log("Nao foi possivel fechar o Chrome via CDP — feche a janela manualmente.");
  }
}

async function main(): Promise<void> {
  if (START_URL !== DEFAULT_PORTAL) {
    console.log(`URL de login: ${START_URL}`);
    if (/sso\.acesso\.gov\.br/i.test(START_URL)) {
      console.log(
        "AVISO: URL directa gov.br — authorization_id expira rapido. Se falhar, use -Fresh e entre por servicos.detran.sc.gov.br.",
      );
    }
  }

  const jaAberto = await devtoolsUp();
  if (!jaAberto) {
    await abrirChrome();
  } else {
    console.log("Chrome CDP ja activo na porta 9222 — a navegar sem abrir popup.");
    await navegarPrimeiraAba(START_URL);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`Chrome (janela dedicada) — ${START_URL}`);
  console.log(
    "Faca login com certificado A1. Consulte um veiculo — ao capturar auth+empresa o Chrome fecha sozinho.",
  );
  console.log("Timeout 15 min. Para manter o browser aberto: --keep-open");

  await anexarTodasAbas();

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 15 * 60 * 1000);
    let devtoolsFails = 0;
    const poll = setInterval(() => {
      void anexarTodasAbas();
      if (captured()) {
        clearInterval(poll);
        clearTimeout(timer);
        console.log("Sessao capturada (auth + empresa).");
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
    await fecharChrome();
  }
  console.log(
    `FIM. token=${cap.auth ? "OK" : "nao capturado"} | empresa=${cap.empresa ?? "?"} | tickets=${cap.tickets.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
