import { badRequest, compileRoute, handleServiceError, json, notFound, readJsonBody, routeAsync, type RouteDef } from "../http.js";
import * as contratosService from "../services/contratos.js";
import * as contratosWrite from "../services/contratosWrite.js";
import type { ContratoCriarRenovarInput } from "../services/contratosWrite.js";
import * as contratosImportService from "../services/importacoes/contratos.js";
import type { MotivoEncerramento } from "../lib-imports.js";

const STATUS_VALIDOS = new Set(["ativo", "encerrado"]);

export function registerContratosRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/contratos");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const statusRaw = ctx.query.get("status");
      if (statusRaw != null && statusRaw !== "" && !STATUS_VALIDOS.has(statusRaw)) {
        return badRequest(ctx, 'Query "status" inválida — use ativo ou encerrado');
      }
      json(ctx.res, 200, await contratosService.listarContratosAsync({
        status: statusRaw as "ativo" | "encerrado" | undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        placa: ctx.query.get("placa") ?? undefined,
        dataInicial: ctx.query.get("dataInicial") ?? undefined,
        dataFinal: ctx.query.get("dataFinal") ?? undefined,
      }));
    }),
  });

  const criar = compileRoute("/api/contratos/criar");
  routes.push({
    method: "POST",
    pattern: criar.regex,
    paramNames: criar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ContratoCriarRenovarInput>(ctx.req);
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
      const body = await readJsonBody<ContratoCriarRenovarInput>(ctx.req);
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

  const sincronizar = compileRoute("/api/contratos/sincronizar");
  routes.push({
    method: "POST",
    pattern: sincronizar.regex,
    paramNames: sincronizar.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ raiz?: string; dryRun?: boolean }>(ctx.req).catch(() => ({}));
        const data = await contratosImportService.executarImportacaoContratos(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const one = compileRoute("/api/contratos/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await contratosService.obterContratoAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Contrato");
      json(ctx.res, 200, { data: item });
    }),
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<contratosWrite.ContratoAtualizarInput>(ctx.req);
        const data = await contratosWrite.atualizarContrato(ctx.params.id, body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      try {
        const data = contratosWrite.removerContrato(ctx.params.id);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    },
  });
}
