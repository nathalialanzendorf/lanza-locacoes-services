import {
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as pagbankService from "../services/pagbank.js";

export function registerPagbankRoutes(routes: RouteDef[]): void {
  const check = compileRoute("/api/pagbank/check");
  routes.push({
    method: "GET",
    pattern: check.regex,
    paramNames: check.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await pagbankService.statusPagBank();
        json(ctx.res, data.ok ? 200 : 503, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const creditos = compileRoute("/api/pagbank/creditos");
  routes.push({
    method: "GET",
    pattern: creditos.regex,
    paramNames: creditos.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const pageRaw = ctx.query.get("page");
        const data = await pagbankService.listarCreditosPagBank({
          inicio: ctx.query.get("inicio") ?? undefined,
          fim: ctx.query.get("fim") ?? undefined,
          page: pageRaw != null ? Number(pageRaw) : undefined,
        });
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const match = compileRoute("/api/pagbank/match");
  routes.push({
    method: "GET",
    pattern: match.regex,
    paramNames: match.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await pagbankService.matchPagBank({
          inicio: ctx.query.get("inicio") ?? undefined,
          fim: ctx.query.get("fim") ?? undefined,
        });
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "POST",
    pattern: match.regex,
    paramNames: match.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ inicio?: string; fim?: string }>(ctx.req).catch(() => ({}));
        const data = await pagbankService.matchPagBank(body);
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
