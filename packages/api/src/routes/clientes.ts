import { badRequest, compileRoute, json, notFound, parseAtivoQuery, type RouteDef } from "../http.js";
import * as clientesService from "../services/clientes.js";

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
}
