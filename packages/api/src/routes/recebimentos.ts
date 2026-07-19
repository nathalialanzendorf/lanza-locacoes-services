import type { MontarPlanoBaixaInput } from "../lib-imports.js";
import {
  compileRoute,
  json,
  parseSyncRastreameBody,
  parseSyncRastreameQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as recebimentosService from "../services/recebimentos.js";

export function registerRecebimentosRoutes(routes: RouteDef[]): void {
  const plano = compileRoute("/api/recebimentos/plano");
  routes.push({
    method: "POST",
    pattern: plano.regex,
    paramNames: plano.paramNames,
    handler: routeAsync(async (ctx) => {
      const input = await readJsonBody<MontarPlanoBaixaInput>(ctx.req);
      const data = await recebimentosService.montarPlano(input);
      json(ctx.res, 200, { data });
    }),
  });

  const executar = compileRoute("/api/recebimentos/executar");
  routes.push({
    method: "POST",
    pattern: executar.regex,
    paramNames: executar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<recebimentosService.ExecutarBaixaInput>(ctx.req);
      const syncRastreame = parseSyncRastreameBody(
        body.syncRastreame,
        parseSyncRastreameQuery(ctx.query.get("syncRastreame")),
      );
      const data = await recebimentosService.executarBaixa({
        ...body,
        syncRastreame,
      });
      json(ctx.res, 200, { data });
    }),
  });
}
