import {
  badRequest,
  compileRoute,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as cnhService from "../services/importacoes/cnh.js";
import * as crlvService from "../services/importacoes/crlv.js";
import * as contratosImportService from "../services/importacoes/contratos.js";
import * as rastreameClientesService from "../services/importacoes/rastreameClientes.js";

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

  const crlv = compileRoute("/api/importacoes/crlv");
  routes.push({
    method: "POST",
    pattern: crlv.regex,
    paramNames: crlv.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<crlvService.ImportarCrlvInput>(ctx.req).catch(() => ({}));
      const data = await crlvService.executarImportacaoCrlv(body);
      json(ctx.res, 200, { data });
    }),
  });

  const contratos = compileRoute("/api/importacoes/contratos");
  routes.push({
    method: "POST",
    pattern: contratos.regex,
    paramNames: contratos.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<contratosImportService.ImportarContratosInput>(ctx.req).catch(
        () => ({}),
      );
      const data = await contratosImportService.executarImportacaoContratos(body);
      json(ctx.res, 200, { data });
    }),
  });

  const rastreame = compileRoute("/api/importacoes/rastreame-clientes");
  routes.push({
    method: "POST",
    pattern: rastreame.regex,
    paramNames: rastreame.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ dryRun?: boolean }>(ctx.req).catch(() => ({}));
      const data = await rastreameClientesService.executarImportacaoClientesRastreame(body);
      json(ctx.res, 200, { data });
    }),
  });
}
