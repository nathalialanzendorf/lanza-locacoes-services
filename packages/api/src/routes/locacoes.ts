import type { LocacaoInput } from "../lib-imports.js";
import {
  compileRoute,
  handleServiceError,
  json,
  notFound,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as locacoesService from "../services/locacoes.js";

export function registerLocacoesRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/locacoes");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      json(ctx.res, 200, locacoesService.listarLocacoes({
        placa: ctx.query.get("placa") ?? undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        situacao: ctx.query.get("situacao") ?? undefined,
      }));
    },
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const input = await readJsonBody<LocacaoInput>(ctx.req);
      const r = locacoesService.criarOuAtualizarLocacao(input);
      json(ctx.res, input.id ? 200 : 201, r);
    }),
  });

  const one = compileRoute("/api/locacoes/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = locacoesService.obterLocacao(ctx.params.id);
      if (!item) return notFound(ctx, "Locação");
      json(ctx.res, 200, { data: item });
    },
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      try {
        const data = locacoesService.removerLocacao(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    },
  });
}
