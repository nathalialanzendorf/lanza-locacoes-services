/**
 * Bridge local para captura SigaPay quando a API está na Vercel.
 * Corre na máquina do operador: abre Chrome via CDP e envia a sessão à API remota.
 *
 *   npm run sigapay-capture-bridge
 *   POST http://127.0.0.1:9235/capture/start  { apiUrl, bearer?, apiKey? }
 */
import { createServer } from "node:http";

import {
  getSigapayCaptureState,
  startSigapayCapture,
  stopSigapayCapture,
  type SigapayCapturedSession,
} from "../src/lib/sigapay/captureCdp.js";

const PORT = Number(process.env.SIGAPAY_CAPTURE_BRIDGE_PORT ?? "9235");
const HOST = "127.0.0.1";

function cors(res: import("node:http").ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function json(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  cors(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

async function persistToRemoteApi(
  apiUrl: string,
  session: SigapayCapturedSession,
  bearer?: string,
  apiKey?: string,
): Promise<void> {
  const base = apiUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (bearer?.trim()) headers.Authorization = `Bearer ${bearer.trim()}`;
  if (apiKey?.trim()) headers["X-API-Key"] = apiKey.trim();

  const r = await fetch(`${base}/api/portais/sigapay/sessao`, {
    method: "PUT",
    headers,
    body: JSON.stringify(session),
  });
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const j = (await r.json()) as { error?: string };
      if (j.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(`Falha ao enviar sessão para a API remota: ${detail}`);
  }
}

const server = createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && path === "/capture/status") {
      json(res, 200, { data: getSigapayCaptureState() });
      return;
    }
    if (req.method === "POST" && path === "/capture/start") {
      const body = await readBody(req);
      const apiUrl = typeof body.apiUrl === "string" ? body.apiUrl.trim() : "";
      const bearer = typeof body.bearer === "string" ? body.bearer : undefined;
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;

      const data = await startSigapayCapture({
        persist: apiUrl
          ? (session) => persistToRemoteApi(apiUrl, session, bearer, apiKey)
          : undefined,
      });
      json(res, 200, { data });
      return;
    }
    if (req.method === "DELETE" && path === "/capture/stop") {
      const data = await stopSigapayCapture();
      json(res, 200, { data });
      return;
    }
    if (req.method === "GET" && path === "/health") {
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { error: "Rota não encontrada" });
  } catch (err) {
    json(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[sigapay-capture-bridge] http://${HOST}:${PORT}`);
  console.log("  GET  /capture/status");
  console.log("  POST /capture/start  { apiUrl, bearer?, apiKey? }");
  console.log("  DELETE /capture/stop");
});
