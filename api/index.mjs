/**
 * Entrypoint Vercel — ficheiro pequeno (carrega antes do bundle pesado).
 * /health responde de imediato; resto delega a ../server.mjs (build).
 */
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "0.1.0";

function writeJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function pathname(req) {
  try {
    return new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

/** @type {Promise<((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) | null> | null} */
let handlerPromise = null;

function loadHandler() {
  if (!handlerPromise) {
    handlerPromise = import("../server.mjs")
      .then((mod) => {
        if (typeof mod.handleRequest === "function") return mod.handleRequest;
        if (typeof mod.default === "function") return mod.default;
        if (mod.default && typeof mod.default.emit === "function") {
          return (req, res) => mod.default.emit("request", req, res);
        }
        return null;
      })
      .catch((err) => {
        console.error("[api/index] falha ao carregar server.mjs:", err);
        return null;
      });
  }
  return handlerPromise;
}

/** Handler exportado para a Vercel (sem listen). */
async function handler(req, res) {
  const p = pathname(req);
  if (req.method === "GET" && p === "/health") {
    writeJson(res, 200, {
      status: "ok",
      service: "@lanza/api",
      version: API_VERSION,
      database: { backend: (process.env.LANZA_DB_BACKEND ?? "postgres").trim() },
      git: {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
        ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
      },
    });
    return;
  }

  const handle = await loadHandler();
  if (handle) {
    handle(req, res);
    return;
  }
  writeJson(res, 503, {
    error: "API ainda a carregar",
    hint: "server.mjs ausente — confirme buildCommand na Vercel",
  });
}

export default handler;

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT) || 3100;
  createServer(handler).listen(port, "0.0.0.0", () => {
    console.log(`[@lanza/api] entry local em http://0.0.0.0:${port}`);
  });
}
