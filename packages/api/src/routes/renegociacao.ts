import {
  badRequest,
  compileRoute,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as renegService from "../services/renegociacao.js";
import type { RenegociacaoInput } from "../lib-imports.js";

export function registerRenegociacaoRoutes(routes: RouteDef[]): void {
  const resumo = compileRoute("/api/renegociacao/resumo");
  routes.push({
    method: "GET",
    pattern: resumo.regex,
    paramNames: resumo.paramNames,
    handler: routeAsync(async (ctx) => {
      const motoristaKey = ctx.query.get("motoristaKey");
      const rastreavelKey = ctx.query.get("rastreavelKey");
      if (!motoristaKey || !rastreavelKey) {
        return badRequest(ctx, 'Queries "motoristaKey" e "rastreavelKey" são obrigatórias');
      }
      const data = await renegService.resumoRenegociacao(motoristaKey, rastreavelKey);
      json(ctx.res, 200, data);
    }),
  });

  const preview = compileRoute("/api/renegociacao/preview");
  routes.push({
    method: "POST",
    pattern: preview.regex,
    paramNames: preview.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<RenegociacaoInput>(ctx.req);
      const data = await renegService.previewRenegociacao(body);
      json(ctx.res, 200, data);
    }),
  });

  const executar = compileRoute("/api/renegociacao/executar");
  routes.push({
    method: "POST",
    pattern: executar.regex,
    paramNames: executar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<RenegociacaoInput>(ctx.req);
      const data = await renegService.executarRenegociacaoApi(body, true);
      json(ctx.res, 200, data);
    }),
  });
}
