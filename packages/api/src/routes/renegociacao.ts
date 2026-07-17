import {
  badRequest,
  compileRoute,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as renegService from "../services/renegociacao.js";
import type { RenegociacaoInput } from "../lib-imports.js";

export function registerRenegociacaoRoutes(routes: RouteDef[]): void {
  const resumo = compileRoute("/api/renegociacao/resumo");
  routes.push({
    method: "GET",
    pattern: resumo.regex,
    paramNames: resumo.paramNames,
    handler: routeAsync(async (ctx) => {
      const motoristaKey = ctx.query.get("motoristaKey") ?? undefined;
      const rastreavelKey = ctx.query.get("rastreavelKey") ?? undefined;
      const clienteId = ctx.query.get("clienteId") ?? undefined;
      const placa = ctx.query.get("placa") ?? undefined;
      const apenasVencidosRaw = ctx.query.get("apenasVencidos");
      const apenasVencidos =
        apenasVencidosRaw == null || apenasVencidosRaw === ""
          ? true
          : ["true", "1", "sim"].includes(apenasVencidosRaw.trim().toLowerCase());

      if (!((motoristaKey && rastreavelKey) || (clienteId && placa))) {
        return badRequest(
          ctx,
          'Informe "motoristaKey" + "rastreavelKey" ou "clienteId" + "placa"',
        );
      }

      const data = await renegService.resumoRenegociacao({
        motoristaKey,
        rastreavelKey,
        clienteId,
        placa,
        apenasVencidos,
      });
      json(ctx.res, 200, data);
    }),
  });

  const preview = compileRoute("/api/renegociacao/preview");
  routes.push({
    method: "POST",
    pattern: preview.regex,
    paramNames: preview.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<RenegociacaoInput>(ctx.req);
      const data = await renegService.previewRenegociacao(body);
      json(ctx.res, 200, data);
    }),
  });

  const executar = compileRoute("/api/renegociacao/executar");
  routes.push({
    method: "POST",
    pattern: executar.regex,
    paramNames: executar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<RenegociacaoInput>(ctx.req);
      const data = await renegService.executarRenegociacaoApi(body, true);
      json(ctx.res, 200, data);
    }),
  });
}
