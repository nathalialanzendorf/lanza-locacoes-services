import {
  badRequest,
  compileRoute,
  json,
  notFound,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as fipeService from "../services/fipe.js";

export function registerFipeRoutes(routes: RouteDef[]): void {
  const marcas = compileRoute("/api/fipe/marcas");
  routes.push({
    method: "GET",
    pattern: marcas.regex,
    paramNames: marcas.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await fipeService.listarMarcasFipe(ctx.query.get("filtro") ?? undefined);
      json(ctx.res, 200, data);
    }),
  });

  const modelos = compileRoute("/api/fipe/marcas/:marcaCode/modelos");
  routes.push({
    method: "GET",
    pattern: modelos.regex,
    paramNames: modelos.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await fipeService.listarModelosFipe(
        ctx.params.marcaCode,
        ctx.query.get("filtro") ?? undefined,
      );
      json(ctx.res, 200, data);
    }),
  });

  const anos = compileRoute("/api/fipe/marcas/:marcaCode/modelos/:modeloCode/anos");
  routes.push({
    method: "GET",
    pattern: anos.regex,
    paramNames: anos.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await fipeService.listarAnosFipe(
        ctx.params.marcaCode,
        ctx.params.modeloCode,
        ctx.query.get("filtro") ?? undefined,
      );
      json(ctx.res, 200, data);
    }),
  });

  const valor = compileRoute(
    "/api/fipe/marcas/:marcaCode/modelos/:modeloCode/anos/:anoCode/valor",
  );
  routes.push({
    method: "GET",
    pattern: valor.regex,
    paramNames: valor.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await fipeService.consultarValorFipe(
        ctx.params.marcaCode,
        ctx.params.modeloCode,
        ctx.params.anoCode,
      );
      json(ctx.res, 200, data);
    }),
  });

  const consultar = compileRoute("/api/fipe/consultar");
  routes.push({
    method: "POST",
    pattern: consultar.regex,
    paramNames: consultar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{
        placa?: string;
        marcaModelo?: string;
        anoModelo?: string;
        marca?: string;
        modelo?: string;
        ano?: number;
        persist?: boolean;
      }>(ctx.req);
      if (!body.placa?.trim()) return badRequest(ctx, "Informe a placa.");
      const data = await fipeService.consultarFipeVeiculo({
        placa: body.placa,
        marcaModelo: body.marcaModelo,
        anoModelo: body.anoModelo,
        marca: body.marca,
        modelo: body.modelo,
        ano: body.ano,
        persist: body.persist,
      });
      json(ctx.res, 200, data);
    }),
  });

  const atualizar = compileRoute("/api/fipe/atualizar-veiculo");
  routes.push({
    method: "POST",
    pattern: atualizar.regex,
    paramNames: atualizar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ placa?: string; id?: string; frota?: boolean }>(ctx.req);
      if (body.frota) {
        const data = await fipeService.atualizarFipeFrota();
        json(ctx.res, 200, data);
        return;
      }
      const alvo = body.placa ?? body.id;
      if (!alvo) return badRequest(ctx, 'Informe "placa", "id" ou "frota": true');
      const data = await fipeService.atualizarFipeVeiculo(alvo);
      json(ctx.res, 200, data);
    }),
  });
}
