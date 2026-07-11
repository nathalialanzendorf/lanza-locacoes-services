import {
  badRequest,
  compileRoute,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as cnhService from "../services/importacoes/cnh.js";

export function registerImportacoesRoutes(routes: RouteDef[]): void {
  const preview = compileRoute("/api/importacoes/cnh/preview");
  routes.push({
    method: "GET",
    pattern: preview.regex,
    paramNames: preview.paramNames,
    handler: (ctx) => {
      const raiz = ctx.query.get("raiz") ?? undefined;
      json(ctx.res, 200, cnhService.previewImportacaoCnh(raiz));
    },
  });

  const importar = compileRoute("/api/importacoes/cnh");
  routes.push({
    method: "POST",
    pattern: importar.regex,
    paramNames: importar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<cnhService.ImportarCnhInput>(ctx.req);
      const data = await cnhService.executarImportacaoCnh(body);
      json(ctx.res, 200, { data });
    }),
  });
}
