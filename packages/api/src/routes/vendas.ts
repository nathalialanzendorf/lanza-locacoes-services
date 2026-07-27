import {
  compileRoute,
  handleServiceError,
  json,
  notFound,
  parseAtivoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import type { VendaInput } from "../lib-imports.js";
import * as vendasService from "../services/vendas.js";

export function registerVendasRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/vendas");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      json(ctx.res, 200, await vendasService.listarVendas({
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        placa: ctx.query.get("placa") ?? undefined,
        ativo,
        dataInicial: ctx.query.get("dataInicial") ?? undefined,
        dataFinal: ctx.query.get("dataFinal") ?? undefined,
      }));
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const input = await readJsonBody<VendaInput>(ctx.req);
        const data = await vendasService.criarVenda(input);
        json(ctx.res, 201, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const one = compileRoute("/api/vendas/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await vendasService.obterVenda(ctx.params.id);
      if (!item) return notFound(ctx, "Venda");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const patch = await readJsonBody<Partial<VendaInput>>(ctx.req);
        const data = await vendasService.atualizarVenda(ctx.params.id, patch);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await vendasService.removerVenda(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
