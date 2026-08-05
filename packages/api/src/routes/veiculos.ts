import type { VeiculoPatch } from "../lib-imports.js";
import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  notFound,
  parseAtivoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import {
  isTipoVeiculoFrotaValor,
  parseTipoVeiculoFrota,
} from "../../../../src/lib/domain/tipoVeiculoFrota.js";
import * as veiculosService from "../services/veiculos.js";

export function registerVeiculosRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/veiculos");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      if (ctx.query.has("ativo") && ativo === undefined) {
        badRequest(ctx, 'Query "ativo" inválida — use true ou false');
        return;
      }
      const particular = parseAtivoQuery(ctx.query.get("particular"));
      if (ctx.query.has("particular") && particular === undefined) {
        badRequest(ctx, 'Query "particular" inválida — use true ou false');
        return;
      }
      const tipoFrotaRaw = ctx.query.get("tipoFrota")?.trim().toLowerCase();
      if (ctx.query.has("tipoFrota") && !isTipoVeiculoFrotaValor(tipoFrotaRaw)) {
        badRequest(ctx, 'Query "tipoFrota" inválida — use locacao, particular ou venda');
        return;
      }
      const placa = ctx.query.get("placa");
      const comFipe = parseAtivoQuery(ctx.query.get("comFipe"));
      if (ctx.query.has("comFipe") && comFipe === undefined) {
        badRequest(ctx, 'Query "comFipe" inválida — use true ou false');
        return;
      }
      json(ctx.res, 200, await veiculosService.listarVeiculosAsync({
        ativo,
        particular,
        tipoFrota: tipoFrotaRaw ? parseTipoVeiculoFrota(tipoFrotaRaw) : undefined,
        placa: placa ?? undefined,
        comFipe: comFipe === true,
      }));
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<veiculosService.CriarVeiculoInput>(ctx.req);
      const data = await veiculosService.criarVeiculo(body);
      json(ctx.res, 201, data);
    }),
  });

  const one = compileRoute("/api/veiculos/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await veiculosService.obterVeiculoAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Veículo");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const patch = await readJsonBody<VeiculoPatch>(ctx.req);
      const data = await veiculosService.atualizarVeiculoAsync(ctx.params.id, patch);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await veiculosService.removerVeiculoAsync(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
