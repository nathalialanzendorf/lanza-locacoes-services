import { badRequest, compileRoute, json, notFound, readJsonBody, routeAsync, type RouteDef } from "../http.js";
import * as contratosService from "../services/contratos.js";
import * as contratosWrite from "../services/contratosWrite.js";
import type { MotivoEncerramento } from "../lib-imports.js";

const STATUS_VALIDOS = new Set(["ativo", "encerrado"]);

export function registerContratosRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/contratos");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const statusRaw = ctx.query.get("status");
      if (statusRaw != null && statusRaw !== "" && !STATUS_VALIDOS.has(statusRaw)) {
        return badRequest(ctx, 'Query "status" inválida — use ativo ou encerrado');
      }
      json(ctx.res, 200, contratosService.listarContratos({
        status: statusRaw as "ativo" | "encerrado" | undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        placa: ctx.query.get("placa") ?? undefined,
      }));
    },
  });

  const criar = compileRoute("/api/contratos/criar");
  routes.push({
    method: "POST",
    pattern: criar.regex,
    paramNames: criar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody(ctx.req);
      const data = await contratosWrite.criarContrato(body);
      json(ctx.res, 201, { data });
    }),
  });

  const renovar = compileRoute("/api/contratos/renovar");
  routes.push({
    method: "POST",
    pattern: renovar.regex,
    paramNames: renovar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody(ctx.req);
      const data = await contratosWrite.renovarContrato(body);
      json(ctx.res, 201, { data });
    }),
  });

  const encerrar = compileRoute("/api/contratos/encerrar");
  routes.push({
    method: "POST",
    pattern: encerrar.regex,
    paramNames: encerrar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{
        idOuPasta?: string;
        id?: string;
        dataEncerramento?: string;
        motivoEncerramento?: MotivoEncerramento;
        quebraContrato?: boolean;
      }>(ctx.req);
      const idOuPasta = body.idOuPasta ?? body.id;
      if (!idOuPasta || !body.dataEncerramento || !body.motivoEncerramento) {
        return badRequest(
          ctx,
          'Campos "idOuPasta", "dataEncerramento" e "motivoEncerramento" são obrigatórios',
        );
      }
      const data = await contratosWrite.encerrarContrato({
        idOuPasta,
        dataEncerramento: body.dataEncerramento,
        motivoEncerramento: body.motivoEncerramento,
        quebraContrato: body.quebraContrato,
      });
      json(ctx.res, 200, { data });
    }),
  });

  const one = compileRoute("/api/contratos/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = contratosService.obterContrato(ctx.params.id);
      if (!item) return notFound(ctx, "Contrato");
      json(ctx.res, 200, { data: item });
    },
  });
}
