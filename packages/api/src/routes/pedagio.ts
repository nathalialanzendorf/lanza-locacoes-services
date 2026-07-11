import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as pedagioService from "../services/pedagio.js";
import type { PassagemStatus } from "../lib-imports.js";

const STATUS_VALIDOS = new Set(["aberto", "pago", "todos"]);

export function registerPedagioRoutes(routes: RouteDef[]): void {
  const veiculos = compileRoute("/api/pedagio/veiculos");
  routes.push({
    method: "GET",
    pattern: veiculos.regex,
    paramNames: veiculos.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await pedagioService.listarVeiculosPortal();
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "POST",
    pattern: veiculos.regex,
    paramNames: veiculos.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          placa?: string;
          modelo?: string;
          marca?: string;
          ano?: string | number;
          cor?: string;
        }>(ctx.req);
        if (!body.placa?.trim()) return badRequest(ctx, 'Campo "placa" é obrigatório');
        const data = await pedagioService.registrarVeiculoPortal({
          placa: body.placa,
          modelo: body.modelo,
          marca: body.marca,
          ano: body.ano,
          cor: body.cor,
        });
        json(ctx.res, 201, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const placa = compileRoute("/api/pedagio/veiculos/:placa");
  routes.push({
    method: "DELETE",
    pattern: placa.regex,
    paramNames: placa.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const dryRun = ctx.query.get("dryRun") === "true";
        const data = await pedagioService.excluirVeiculoPortal(ctx.params.placa, dryRun);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const passagens = compileRoute("/api/pedagio/passagens");
  routes.push({
    method: "GET",
    pattern: passagens.regex,
    paramNames: passagens.paramNames,
    handler: routeAsync(async (ctx) => {
      const placaQ = ctx.query.get("placa");
      if (!placaQ) return badRequest(ctx, 'Query "placa" é obrigatória');
      const statusRaw = ctx.query.get("status") ?? "aberto";
      if (!STATUS_VALIDOS.has(statusRaw)) {
        return badRequest(ctx, 'Query "status" inválida — use aberto, pago ou todos');
      }
      try {
        const data = await pedagioService.listarPassagensPlaca(
          placaQ,
          statusRaw as PassagemStatus,
        );
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const conferir = compileRoute("/api/pedagio/conferir");
  routes.push({
    method: "GET",
    pattern: conferir.regex,
    paramNames: conferir.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await pedagioService.conferirPlacasPortal(false);
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "POST",
    pattern: conferir.regex,
    paramNames: conferir.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = (await readJsonBody<{ registrar?: boolean }>(ctx.req).catch(
          () => ({}),
        )) as { registrar?: boolean };
        const data = await pedagioService.conferirPlacasPortal(body.registrar === true);
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
