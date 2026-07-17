import { compileRoute, json, readJsonBody, routeAsync, type RouteDef } from "../http.js";
import {
  canRegister,
  getSessionUser,
  loginUser,
  registerUser,
  validateLoginInput,
  validateRegisterInput,
} from "../services/auth.js";
import { countUsers, usersStorageHint } from "../services/users.js";
import { jwtSecret } from "../config.js";

export function registerAuthRoutes(routes: RouteDef[]): void {
  const register = compileRoute("/api/auth/register");
  routes.push({
    method: "POST",
    pattern: register.regex,
    paramNames: register.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const input = validateRegisterInput(body);
      const result = await registerUser(input);
      json(ctx.res, 201, result);
    }),
  });

  const login = compileRoute("/api/auth/login");
  routes.push({
    method: "POST",
    pattern: login.regex,
    paramNames: login.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const input = validateLoginInput(body);
      const result = await loginUser(input);
      json(ctx.res, 200, result);
    }),
  });

  const me = compileRoute("/api/auth/me");
  routes.push({
    method: "GET",
    pattern: me.regex,
    paramNames: me.paramNames,
    handler: routeAsync(async (ctx) => {
      const user = await getSessionUser(ctx.req);
      if (!user) {
        json(ctx.res, 401, { error: "Não autenticado" });
        return;
      }
      json(ctx.res, 200, { user });
    }),
  });

  const status = compileRoute("/api/auth/status");
  routes.push({
    method: "GET",
    pattern: status.regex,
    paramNames: status.paramNames,
    handler: routeAsync(async (ctx) => {
      const total = await countUsers();
      json(ctx.res, 200, {
        jwtConfigured: Boolean(jwtSecret()),
        registerAllowed: await canRegister(),
        userCount: total,
        storage: usersStorageHint(),
      });
    }),
  });
}
