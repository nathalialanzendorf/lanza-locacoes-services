/** /health — function isolada (sem importar server.mjs). */
import { resolveDbBackend } from "./resolveDbBackend.mjs";

const API_VERSION = "0.1.0";

export default function handler(_req, res) {
  const body = JSON.stringify({
    status: "ok",
    service: "@lanza/api",
    version: API_VERSION,
    route: "api/health",
    database: { backend: resolveDbBackend() },
    git: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
      ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
    },
  });
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
