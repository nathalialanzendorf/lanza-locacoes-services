/**
 * Bridge local para captura DETRAN SC quando a API está na Vercel.
 * Corre na máquina do operador: escuta pedidos do frontend e abre Chrome via CDP.
 *
 *   npm run detran-capture-bridge
 *   POST http://127.0.0.1:9234/capture/start
 */
import { createServer } from "node:http";

import {
  getDetranScCaptureState,
  startDetranScCapture,
  stopDetranScCapture,
} from "../src/lib/detranSc/captureCdp.js";

const PORT = Number(process.env.DETRAN_CAPTURE_BRIDGE_PORT ?? "9234");
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

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
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
      json(res, 200, { data: getDetranScCaptureState() });
      return;
    }
    if (req.method === "POST" && path === "/capture/start") {
      const data = await startDetranScCapture();
      json(res, 200, { data });
      return;
    }
    if (req.method === "DELETE" && path === "/capture/stop") {
      const data = await stopDetranScCapture();
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
  console.log(`[detran-capture-bridge] http://${HOST}:${PORT}`);
  console.log("  GET  /capture/status");
  console.log("  POST /capture/start");
  console.log("  DELETE /capture/stop");
});
