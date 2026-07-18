import { compileRoute, json, routeAsync, type RouteDef } from "../http.js";
import * as metaService from "../services/meta.js";
import * as resumoService from "../services/resumo.js";

export function registerMetaRoutes(routes: RouteDef[]): void {
  const meta = compileRoute("/api/meta");
  routes.push({
    method: "GET",
    pattern: meta.regex,
    paramNames: meta.paramNames,
    handler: (ctx) => json(ctx.res, 200, metaService.obterMeta()),
  });

  const resumo = compileRoute("/api/resumo");
  routes.push({
    method: "GET",
    pattern: resumo.regex,
    paramNames: resumo.paramNames,
    handler: routeAsync(async (ctx) => {
      json(ctx.res, 200, await resumoService.obterResumoAsync());
    }),
  });
}
