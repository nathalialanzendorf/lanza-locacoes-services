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
    handler: routeAsync(async (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      if (ctx.query.has("ativo") && ativo === undefined) {
        badRequest(ctx, 'Query "ativo" inválida — use true ou false');
        return;
      }
      json(ctx.res, 200, await clientesService.listarClientesAsync({
        ativo,
        cpf: ctx.query.get("cpf") ?? undefined,
      }));
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ClienteImportado>(ctx.req);
      const r = await clientesService.criarCliente(body);
      json(ctx.res, 201, r);
    }),
  });

  const one = compileRoute("/api/clientes/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await clientesService.obterClienteAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Cliente");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const patch = await readJsonBody<AtualizarClienteBody>(ctx.req);
      const data = await clientesService.atualizarClienteAsync(ctx.params.id, patch);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await clientesService.removerClienteAsync(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
