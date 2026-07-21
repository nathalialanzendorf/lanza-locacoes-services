import {
  badRequest,
  compileRoute,
  json,
  notFound,
  parseAtivoQuery,
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
      const data = await parceirosService.vincularVeiculoParceiroAsync(body.veiculoId, body.parceiroId);
      json(ctx.res, 201, { data });
    }),
  });

  const vinculoOne = compileRoute("/api/parceiros/vinculos/:id");
  routes.push({
    method: "DELETE",
    pattern: vinculoOne.regex,
    paramNames: vinculoOne.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await parceirosService.removerVinculoAsync(ctx.params.id);
      json(ctx.res, 200, { data });
    }),
  });

  const list = compileRoute("/api/parceiros");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      if (ctx.query.has("ativo") && ativo === undefined) {
        return badRequest(ctx, 'Query "ativo" inválida — use true ou false');
      }
      json(ctx.res, 200, await parceirosService.listarParceirosAsync({ ativo }));
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ nome?: string }>(ctx.req);
      if (!body.nome?.trim()) return badRequest(ctx, 'Campo "nome" é obrigatório');
      const data = await parceirosService.criarParceiroAsync(body.nome);
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
      const body = await readJsonBody<parceirosService.AtualizarParceiroPatch>(ctx.req);
      if (body.nome !== undefined && !body.nome.trim()) {
        return badRequest(ctx, 'Campo "nome" não pode ser vazio');
      }
      if (body.nome === undefined && body.ativo === undefined) {
        return badRequest(ctx, 'Informe "nome" e/ou "ativo"');
      }
      const data = await parceirosService.atualizarParceiroAsync(ctx.params.id, body);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await parceirosService.removerParceiroAsync(ctx.params.id);
      json(ctx.res, 200, { data });
    }),
  });
}
