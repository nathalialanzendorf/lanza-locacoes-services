import {
  badRequest,
  compileRoute,
  json,
  notFound,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as parceirosService from "../services/parceiros.js";

export function registerParceirosRoutes(routes: RouteDef[]): void {
  const vinculos = compileRoute("/api/parceiros/vinculos");
  routes.push({
    method: "GET",
    pattern: vinculos.regex,
    paramNames: vinculos.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await parceirosService.listarVinculosAsync({
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        parceiroId: ctx.query.get("parceiroId") ?? undefined,
      });
      json(ctx.res, 200, data);
    }),
  });

  routes.push({
    method: "POST",
    pattern: vinculos.regex,
    paramNames: vinculos.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ veiculoId?: string; parceiroId?: string }>(ctx.req);
      if (!body.veiculoId || !body.parceiroId) {
        return badRequest(ctx, 'Campos "veiculoId" e "parceiroId" são obrigatórios');
      }
      const data = parceirosService.vincularVeiculoParceiro(body.veiculoId, body.parceiroId);
      json(ctx.res, 201, { data });
    }),
  });

  const vinculoOne = compileRoute("/api/parceiros/vinculos/:id");
  routes.push({
    method: "DELETE",
    pattern: vinculoOne.regex,
    paramNames: vinculoOne.paramNames,
    handler: (ctx) => {
      const data = parceirosService.removerVinculo(ctx.params.id);
      json(ctx.res, 200, { data });
    },
  });

  const list = compileRoute("/api/parceiros");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      json(ctx.res, 200, await parceirosService.listarParceirosAsync());
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ nome?: string }>(ctx.req);
      if (!body.nome?.trim()) return badRequest(ctx, 'Campo "nome" é obrigatório');
      const data = parceirosService.criarParceiro(body.nome);
      json(ctx.res, 201, { data });
    }),
  });

  const one = compileRoute("/api/parceiros/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await parceirosService.obterParceiroAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Parceiro");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ nome?: string }>(ctx.req);
      if (!body.nome?.trim()) return badRequest(ctx, 'Campo "nome" é obrigatório');
      const data = parceirosService.atualizarParceiro(ctx.params.id, body.nome);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const data = parceirosService.removerParceiro(ctx.params.id);
      json(ctx.res, 200, { data });
    },
  });
}
