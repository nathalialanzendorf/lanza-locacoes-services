import { badRequest, compileRoute, json, notFound, parseAtivoQuery, type RouteDef } from "../http.js";
import * as veiculosService from "../services/veiculos.js";

export function registerVeiculosRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/veiculos");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      if (ctx.query.has("ativo") && ativo === undefined) {
        return badRequest(ctx, 'Query "ativo" inválida — use true ou false');
      }
      const placa = ctx.query.get("placa");
      json(ctx.res, 200, veiculosService.listarVeiculos({
        ativo,
        placa: placa ?? undefined,
      }));
    },
  });

  const one = compileRoute("/api/veiculos/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = veiculosService.obterVeiculo(ctx.params.id);
      if (!item) return notFound(ctx, "Veículo");
      json(ctx.res, 200, { data: item });
    },
  });
}
