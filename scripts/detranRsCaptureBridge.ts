/**
 * Bridge local para captura DETRAN RS quando a API está na Vercel.
 *
 *   npm run detran-rs-capture-bridge
 *   GET|POST http://127.0.0.1:9237/capture/start?apiUrl=…&bearer=…
 */
import { createServer } from "node:http";

import {
  getDetranRsCaptureState,
  startDetranRsCapture,
  stopDetranRsCapture,
  type DetranRsCapturedSession,
} from "../src/lib/detranRs/captureCdp.js";
import {
  bridgeCors,
  bridgeJson,
  parseCaptureStartRequest,
  persistSessionToRemoteApi,
  respondCaptureStart,
} from "./captureBridgeHttp.js";

const PORT = Number(process.env.DETRAN_RS_CAPTURE_BRIDGE_PORT ?? "9237");
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
      bridgeJson(res, 200, { data: getDetranRsCaptureState() });
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && path === "/capture/start") {
      const { apiUrl, bearer, apiKey } = await parseCaptureStartRequest(req, url);
      const data = await startDetranRsCapture({
        persist: apiUrl
          ? (session: DetranRsCapturedSession) =>
              persistSessionToRemoteApi(
                apiUrl,
                "/api/portais/detran-rs/sessao",
                { auth: session.auth, userId: session.userId },
                bearer,
                apiKey,
              )
          : undefined,
      });
      respondCaptureStart(req, res, data, "Captura DETRAN RS");
      return;
    }
    if (req.method === "DELETE" && path === "/capture/stop") {
      bridgeJson(res, 200, { data: await stopDetranRsCapture() });
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

server.listen(PORT, HOST, () => {
  console.log(`[detran-rs-capture-bridge] http://${HOST}:${PORT}`);
  console.log("  GET  /capture/status");
  console.log("  GET|POST /capture/start  ?apiUrl=&bearer=&apiKey=");
  console.log("  DELETE /capture/stop");
});
