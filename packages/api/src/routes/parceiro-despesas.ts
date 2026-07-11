import {
  badRequest,
  compileRoute,
  json,
  notFound,
  parseEmAbertoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as parceiroDespService from "../services/parceiroDespesas.js";
import type { ParceiroDespesaInput } from "../lib-imports.js";

export function registerParceiroDespesasRoutes(routes: RouteDef[]): void {
  const baixa = compileRoute("/api/parceiro-despesas/baixa");
  routes.push({
    method: "POST",
    pattern: baixa.regex,
    paramNames: baixa.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{
        id?: string;
        placa?: string;
        categoria?: string;
        competencia?: string;
        data?: string;
        desfazer?: boolean;
      }>(ctx.req);
      const data = parceiroDespService.baixarParceiroDespesa(body, {
        data: body.data,
        desfazer: body.desfazer,
      });
      json(ctx.res, 200, { data });
    }),
  });

  const list = compileRoute("/api/parceiro-despesas");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      json(ctx.res, 200, parceiroDespService.listarParceiroDespesas({
        placa: ctx.query.get("placa") ?? undefined,
        categoria: ctx.query.get("categoria") ?? undefined,
        competencia: ctx.query.get("competencia") ?? undefined,
        emAberto: parseEmAbertoQuery(ctx.query.get("emAberto")),
      }));
    },
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ParceiroDespesaInput>(ctx.req);
      const r = parceiroDespService.criarParceiroDespesa(body);
      json(ctx.res, 201, r);
    }),
  });

  const one = compileRoute("/api/parceiro-despesas/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = parceiroDespService.obterParceiroDespesa(ctx.params.id);
      if (!item) return notFound(ctx, "Despesa parceiro");
      json(ctx.res, 200, { data: item });
    },
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const data = parceiroDespService.atualizarParceiroDespesa(ctx.params.id, body);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const data = parceiroDespService.removerParceiroDespesa(ctx.params.id);
      json(ctx.res, 200, { data });
    },
  });
}
