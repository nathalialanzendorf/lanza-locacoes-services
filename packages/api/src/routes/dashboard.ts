import { compileRoute, json, routeAsync, type RouteDef } from "../http.js";
import * as dashboardRecebimentosService from "../services/dashboardRecebimentos.js";

export function registerDashboardRoutes(routes: RouteDef[]): void {
  const recebimentosTotais = compileRoute("/api/dashboard/recebimentos/totais");
  routes.push({
    method: "GET",
    pattern: recebimentosTotais.regex,
    paramNames: recebimentosTotais.paramNames,
    handler: routeAsync(async (ctx) => {
      json(ctx.res, 200, await dashboardRecebimentosService.obterDashboardRecebimentosTotaisApiAsync());
    }),
  });

  const recebimentosAtrasados = compileRoute("/api/dashboard/recebimentos/atrasados");
  routes.push({
    method: "GET",
    pattern: recebimentosAtrasados.regex,
    paramNames: recebimentosAtrasados.paramNames,
    handler: routeAsync(async (ctx) => {
      json(
        ctx.res,
        200,
        await dashboardRecebimentosService.listarDashboardRecebimentosAtrasadosApiAsync(),
      );
    }),
  });
}
