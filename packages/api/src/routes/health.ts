import { compileRoute, json, routeAsync, type RouteDef } from "../http.js";
import { obterStatusSistema } from "../services/status.js";

export function registerHealthRoutes(routes: RouteDef[]): void {
  const root = compileRoute("/");
  routes.push({
    method: "GET",
    pattern: root.regex,
    paramNames: root.paramNames,
    handler: (ctx) => {
      ctx.res.writeHead(302, { Location: "/api/docs" });
      ctx.res.end();
    },
  });

  const { regex, paramNames } = compileRoute("/health");
  routes.push({
    method: "GET",
    pattern: regex,
    paramNames,
    handler: routeAsync(async (ctx) => {
      json(ctx.res, 200, await obterStatusSistema());
    }),
  });
}
