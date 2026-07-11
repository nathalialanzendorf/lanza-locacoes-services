import {
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as inicioLocacoesService from "../services/inicioLocacoes.js";

export function registerInicioLocacoesRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/veiculos/inicio-locacoes");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => json(ctx.res, 200, inicioLocacoesService.listarInicioLocacoesDerivado()),
  });

  const derivar = compileRoute("/api/veiculos/inicio-locacoes/derivar");
  routes.push({
    method: "POST",
    pattern: derivar.regex,
    paramNames: derivar.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ sobrescrever?: boolean; dryRun?: boolean }>(ctx.req).catch(
          () => ({}),
        );
        const data = inicioLocacoesService.derivarInicioLocacoesVeiculos(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
