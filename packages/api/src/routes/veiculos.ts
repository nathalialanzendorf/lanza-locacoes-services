import type { VeiculoPatch } from "../lib-imports.js";
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
import * as veiculosService from "../services/veiculos.js";

export function registerVeiculosRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/veiculos");
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
      const placa = ctx.query.get("placa");
      json(ctx.res, 200, await veiculosService.listarVeiculosAsync({
        ativo,
        placa: placa ?? undefined,
      }));
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<veiculosService.CriarVeiculoInput>(ctx.req);
      const data = await veiculosService.criarVeiculo(body);
      json(ctx.res, 201, data);
    }),
  });

  const one = compileRoute("/api/veiculos/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await veiculosService.obterVeiculoAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Veículo");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const patch = await readJsonBody<VeiculoPatch>(ctx.req);
      const data = veiculosService.atualizarVeiculo(ctx.params.id, patch);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      try {
        const data = veiculosService.removerVeiculo(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    },
  });
}
