import { API_VERSION } from "../config.js";
import { compileRoute, json, type RouteDef } from "../http.js";

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
    handler: (ctx) => {
      json(ctx.res, 200, {
        status: "ok",
        service: "@lanza/api",
        version: API_VERSION,
      });
    },
  });
}
