/** CORS mínimo para entrypoints leves (health) — espelha packages/api/src/config.ts */

const DEFAULT_FRONTEND_ORIGINS = [
  "https://lanzalocacoes.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function corsOrigins() {
  const raw = process.env.LANZA_API_CORS_ORIGIN?.trim();
  if (!raw) {
    const web = process.env.LANZA_WEB_URL?.trim();
    const origins = [...DEFAULT_FRONTEND_ORIGINS];
    if (web && !origins.includes(web)) origins.push(web);
    return origins;
  }
  if (raw === "*") return ["*"];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function resolveCorsOrigin(requestOrigin) {
  const allowed = corsOrigins();
  if (allowed.includes("*")) return "*";
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  if (
    requestOrigin &&
    /^https:\/\/(lanzalocacoes|lanza-web|lanza-locacoes-app)[\w-]*\.vercel\.app$/.test(
      requestOrigin,
    )
  ) {
    return requestOrigin;
  }
  return allowed[0] ?? null;
}

export function applyCorsHeaders(res, origin) {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (origin !== "*") res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
}
