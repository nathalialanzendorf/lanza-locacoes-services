import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as estacionamentoService from "../services/estacionamento.js";
import type { AvisoStatus } from "../lib-imports.js";

const STATUS_VALIDOS = new Set(["aberto", "pago", "todos"]);

export function registerEstacionamentoRoutes(routes: RouteDef[]): void {
  const veiculos = compileRoute("/api/estacionamento/veiculos");
  routes.push({
    method: "GET",
    pattern: veiculos.regex,
    paramNames: veiculos.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await estacionamentoService.listarVeiculosPortal();
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
          apelido?: string;
        }>(ctx.req);
        if (!body.placa?.trim()) return badRequest(ctx, 'Campo "placa" é obrigatório');
        const data = await estacionamentoService.registrarVeiculoPortal({
          placa: body.placa.trim(),
          modelo: body.modelo,
          apelido: body.apelido,
        });
        json(ctx.res, 201, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const placa = compileRoute("/api/estacionamento/veiculos/:placa");
  routes.push({
    method: "DELETE",
    pattern: placa.regex,
    paramNames: placa.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const dryRun = ctx.query.get("dryRun") === "true";
        const data = await estacionamentoService.excluirVeiculoPortal(ctx.params.placa, dryRun);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const avisos = compileRoute("/api/estacionamento/avisos");
  routes.push({
    method: "GET",
    pattern: avisos.regex,
    paramNames: avisos.paramNames,
    handler: routeAsync(async (ctx) => {
      const placaQ = ctx.query.get("placa");
      if (!placaQ) return badRequest(ctx, 'Query "placa" é obrigatória');
      const statusRaw = ctx.query.get("status") ?? "aberto";
      if (!STATUS_VALIDOS.has(statusRaw)) {
        return badRequest(ctx, 'Query "status" inválida — use aberto, pago ou todos');
      }
      try {
        const data = await estacionamentoService.listarAvisosPlaca(
          placaQ,
          statusRaw as AvisoStatus,
        );
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const conferir = compileRoute("/api/estacionamento/conferir");
  routes.push({
    method: "GET",
    pattern: conferir.regex,
    paramNames: conferir.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await estacionamentoService.conferirPlacasPortal(false);
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
        const data = await estacionamentoService.conferirPlacasPortal(body.registrar === true);
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
