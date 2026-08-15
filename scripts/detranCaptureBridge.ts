/**
 * Bridge local para captura DETRAN SC quando a API está na Vercel.
 *
 *   npm run detran-capture-bridge
 *   GET|POST http://127.0.0.1:9234/capture/start?apiUrl=…&bearer=…
 */
import { createServer } from "node:http";

import {
  getDetranScCaptureState,
  startDetranScCapture,
  stopDetranScCapture,
  type DetranScCapturedSession,
} from "../src/lib/detranSc/captureCdp.js";
import {
  bridgeCors,
  bridgeJson,
  parseCaptureStartRequest,
  persistSessionToRemoteApi,
  respondCaptureStart,
} from "./captureBridgeHttp.js";
import { listenCaptureBridge } from "./captureBridgeListen.js";

const PORT = Number(process.env.DETRAN_CAPTURE_BRIDGE_PORT ?? "9234");
const HOST = "127.0.0.1";

const server = createServer(async (req, res) => {
  bridgeCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && path === "/capture/status") {
      bridgeJson(res, 200, { data: getDetranScCaptureState() });
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && path === "/capture/start") {
      const { apiUrl, bearer, apiKey } = await parseCaptureStartRequest(req, url);
      const data = await startDetranScCapture({
        persist: apiUrl
          ? (session: DetranScCapturedSession) =>
              persistSessionToRemoteApi(
                apiUrl,
                "/api/portais/detran-sc/sessao",
                session,
                bearer,
                apiKey,
              )
          : undefined,
      });
      respondCaptureStart(req, res, data, "Captura DETRAN SC");
      return;
    }
    if (req.method === "DELETE" && path === "/capture/stop") {
      bridgeJson(res, 200, { data: await stopDetranScCapture() });
      return;
    }
    if (req.method === "GET" && path === "/health") {
      bridgeJson(res, 200, { ok: true });
      return;
    }
    bridgeJson(res, 404, { error: "Rota não encontrada" });
  } catch (err) {
    bridgeJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

listenCaptureBridge(server, PORT, HOST, "detran-capture-bridge", () => {
  console.log(`[detran-capture-bridge] http://${HOST}:${PORT}`);
  console.log("  GET  /capture/status");
  console.log("  GET|POST /capture/start  ?apiUrl=&bearer=&apiKey=");
  console.log("  DELETE /capture/stop");
});
