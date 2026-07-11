import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { API_VERSION, apiKey, corsOrigin } from "./config.js";
import { json, matchRoute, type RouteDef } from "./http.js";
import { registerClientesRoutes } from "./routes/clientes.js";
import { registerContratosRoutes } from "./routes/contratos.js";
import { registerDespesasRoutes } from "./routes/despesas.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerVeiculosRoutes } from "./routes/veiculos.js";

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin());
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function isAuthorized(req: IncomingMessage): boolean {
  const expected = apiKey();
  if (!expected) return true;
  const provided = String(req.headers["x-api-key"] ?? "").trim();
  return provided === expected;
}

function collectRoutes(): RouteDef[] {
  const routes: RouteDef[] = [];
  registerHealthRoutes(routes);
  registerClientesRoutes(routes);
  registerVeiculosRoutes(routes);
  registerContratosRoutes(routes);
  registerDespesasRoutes(routes);
  return routes;
}

export function createApp() {
  const routes = collectRoutes();

  return createServer(async (req, res) => {
    applyCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const method = req.method ?? "GET";

      if (pathname.startsWith("/api") && !isAuthorized(req)) {
        json(res, 401, { error: "Não autorizado" });
        return;
      }

      const matched = matchRoute(routes, method, pathname);
      if (!matched) {
        json(res, 404, { error: "Rota não encontrada" });
        return;
      }

      await matched.handler({
        req,
        res,
        params: matched.params,
        query: url.searchParams,
        method,
        path: pathname,
      });
    } catch (err) {
      console.error("[@lanza/api] erro:", err);
      if (!res.headersSent) {
        json(res, 500, { error: "Erro interno do servidor" });
      }
    }
  });
}

export function logStartup(port: number, host: string): void {
  const auth = apiKey() ? "LANZA_API_KEY ativa" : "sem LANZA_API_KEY (modo dev)";
  console.log(`[@lanza/api] v${API_VERSION} em http://${host}:${port}`);
  console.log(`[@lanza/api] ${auth}`);
  console.log("[@lanza/api] rotas: GET /health, GET /api/clientes, /api/veiculos, /api/contratos, /api/despesas");
}
