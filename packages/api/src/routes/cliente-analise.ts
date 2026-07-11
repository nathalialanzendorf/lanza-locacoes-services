import { compileRoute, json, type RouteDef } from "../http.js";
import * as clienteAnaliseService from "../services/clienteAnalise.js";

export function registerClienteAnaliseRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/cliente-analise");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const comAlerta = ctx.query.get("comAlerta");
      json(ctx.res, 200, clienteAnaliseService.listarAchadosClienteAnalise({
        cpf: ctx.query.get("cpf") ?? undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        comAlerta: comAlerta === "true" || comAlerta === "1",
      }));
    },
  });
}
