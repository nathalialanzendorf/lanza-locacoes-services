import type { ClienteImportado, ClientePatch } from "../lib-imports.js";
import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  notFound,
  parseAtivoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as clientesService from "../services/clientes.js";

type AtualizarClienteBody = ClientePatch;

export function registerClientesRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/clientes");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      if (ctx.query.has("ativo") && ativo === undefined) {
        return badRequest(ctx, 'Query "ativo" inválida — use true ou false');
      }
      json(ctx.res, 200, clientesService.listarClientes({ ativo }));
    },
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ClienteImportado>(ctx.req);
      const r = clientesService.criarCliente(body);
      json(ctx.res, 201, r);
    }),
  });

  const one = compileRoute("/api/clientes/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = clientesService.obterCliente(ctx.params.id);
      if (!item) return notFound(ctx, "Cliente");
      json(ctx.res, 200, { data: item });
    },
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const patch = await readJsonBody<AtualizarClienteBody>(ctx.req);
      const data = clientesService.atualizarCliente(ctx.params.id, patch);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      try {
        const data = clientesService.removerCliente(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    },
  });
}
