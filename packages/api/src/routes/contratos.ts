import { badRequest, compileRoute, json, notFound, type RouteDef } from "../http.js";
import * as contratosService from "../services/contratos.js";

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
