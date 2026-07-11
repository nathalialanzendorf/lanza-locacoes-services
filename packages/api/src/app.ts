import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { API_VERSION, apiKey, corsOrigin } from "./config.js";
import { json, matchRoute, type RouteDef } from "./http.js";
import { registerAnaliseCadastroRoutes } from "./routes/analise-cadastro.js";
import { registerClienteAnaliseRoutes } from "./routes/cliente-analise.js";
import { registerClientesRoutes } from "./routes/clientes.js";
import { registerContratosRoutes } from "./routes/contratos.js";
import { registerDespesasRoutes } from "./routes/despesas.js";
import { registerFipeRoutes } from "./routes/fipe.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInicioLocacoesRoutes } from "./routes/inicio-locacoes.js";
import { registerInfracoesRoutes } from "./routes/infracoes.js";
import { registerImportacoesRoutes } from "./routes/importacoes.js";
import { registerLocacoesRoutes } from "./routes/locacoes.js";
import { OPENAPI_PUBLIC_PATHS } from "./openapi/index.js";
import { registerMetaRoutes } from "./routes/meta.js";
import { registerOpenApiRoutes } from "./routes/openapi.js";
import { registerPagbankRoutes } from "./routes/pagbank.js";
import { registerParceiroDespesasRoutes } from "./routes/parceiro-despesas.js";
import { registerParceirosRoutes } from "./routes/parceiros.js";
import { registerPedagioRoutes } from "./routes/pedagio.js";
import { registerRenegociacaoRoutes } from "./routes/renegociacao.js";
import { registerRastreameRoutes } from "./routes/rastreame.js";
import { registerRecebimentosRoutes } from "./routes/recebimentos.js";
import { registerRelatoriosRoutes } from "./routes/relatorios.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerVeiculosRoutes } from "./routes/veiculos.js";

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin());
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
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
  registerOpenApiRoutes(routes);
  registerMetaRoutes(routes);
  registerClientesRoutes(routes);
  registerVeiculosRoutes(routes);
  registerInicioLocacoesRoutes(routes);
  registerContratosRoutes(routes);
  registerDespesasRoutes(routes);
  registerLocacoesRoutes(routes);
  registerRecebimentosRoutes(routes);
  registerRelatoriosRoutes(routes);
  registerSyncRoutes(routes);
  registerImportacoesRoutes(routes);
  registerAnaliseCadastroRoutes(routes);
  registerClienteAnaliseRoutes(routes);
  registerFipeRoutes(routes);
  registerParceirosRoutes(routes);
  registerParceiroDespesasRoutes(routes);
  registerInfracoesRoutes(routes);
  registerRenegociacaoRoutes(routes);
  registerRastreameRoutes(routes);
  registerPagbankRoutes(routes);
  registerPedagioRoutes(routes);
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

      if (
        pathname.startsWith("/api") &&
        !OPENAPI_PUBLIC_PATHS.has(pathname) &&
        !isAuthorized(req)
      ) {
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
  console.log(
    `[@lanza/api] docs: http://${host}:${port}/api/docs | spec: /api/openapi.json`,
  );
}
