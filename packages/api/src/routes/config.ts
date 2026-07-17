import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as configService from "../services/config.js";

export function registerConfigRoutes(routes: RouteDef[]): void {
  const rastreame = compileRoute("/api/config/rastreame-espelho");
  routes.push({
    method: "GET",
    pattern: rastreame.regex,
    paramNames: rastreame.paramNames,
    handler: (ctx) => json(ctx.res, 200, configService.obterConfigRastreameEspelho()),
  });

  routes.push({
    method: "PATCH",
    pattern: rastreame.regex,
    paramNames: rastreame.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ ativo?: boolean }>(ctx.req);
        if (typeof body.ativo !== "boolean") {
          return badRequest(ctx, 'Campo "ativo" (boolean) é obrigatório');
        }
        const data = configService.atualizarConfigRastreameEspelho(body.ativo);
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
