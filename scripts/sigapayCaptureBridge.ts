/**
 * Bridge local para captura SigaPay quando a API está na Vercel.
 *
 *   npm run sigapay-capture-bridge
 *   GET|POST http://127.0.0.1:9235/capture/start?apiUrl=…&bearer=…
 */
import { createServer } from "node:http";

import {
  getSigapayCaptureState,
  startSigapayCapture,
  stopSigapayCapture,
  type SigapayCapturedSession,
} from "../src/lib/sigapay/captureCdp.js";
import {
  bridgeCors,
  bridgeJson,
  parseCaptureStartRequest,
  persistSessionToRemoteApi,
  respondCaptureStart,
} from "./captureBridgeHttp.js";
import { listenCaptureBridge } from "./captureBridgeListen.js";

const PORT = Number(process.env.SIGAPAY_CAPTURE_BRIDGE_PORT ?? "9235");
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
      bridgeJson(res, 200, { data: getSigapayCaptureState() });
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && path === "/capture/start") {
      const { apiUrl, bearer, apiKey } = await parseCaptureStartRequest(req, url);
      const data = await startSigapayCapture({
        persist: apiUrl
          ? (session: SigapayCapturedSession) =>
              persistSessionToRemoteApi(
                apiUrl,
                "/api/portais/sigapay/sessao",
                session,
                bearer,
                apiKey,
              )
          : undefined,
      });
      respondCaptureStart(req, res, data, "Captura SigaPay");
      return;
    }
    if (req.method === "DELETE" && path === "/capture/stop") {
      bridgeJson(res, 200, { data: await stopSigapayCapture() });
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

listenCaptureBridge(server, PORT, HOST, "sigapay-capture-bridge", () => {
  console.log(`[sigapay-capture-bridge] http://${HOST}:${PORT}`);
  console.log("  GET  /capture/status");
  console.log("  GET|POST /capture/start  ?apiUrl=&bearer=&apiKey=");
  console.log("  DELETE /capture/stop");
});
