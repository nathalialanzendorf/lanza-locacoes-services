import type { ClienteDespesaInput, ClienteDespesaPatch } from "../lib-imports.js";
import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  notFound,
  parseAtivoQuery,
  parseEmAbertoQuery,
  parseSyncRastreameBody,
  parseSyncRastreameQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as despesasService from "../services/despesas.js";

type CriarDespesaBody = {
  veiculoId: string;
  despesa: ClienteDespesaInput;
  syncRastreame?: boolean;
};

type ConfirmarCondutorBody = {
  condutorId?: string | null;
  syncRastreame?: boolean;
};

export function registerDespesasRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/despesas");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      const emAberto = parseEmAbertoQuery(ctx.query.get("emAberto"));

      if (ctx.query.has("ativo") && ativo === undefined) {
        return badRequest(ctx, 'Query "ativo" inválida — use true ou false');
      }
      if (ctx.query.has("emAberto") && emAberto === undefined) {
        return badRequest(ctx, 'Query "emAberto" inválida — use true ou false');
      }

      json(ctx.res, 200, despesasService.listarDespesas({
        clienteId: ctx.query.get("clienteId") ?? undefined,
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        placa: ctx.query.get("placa") ?? undefined,
        categoria: ctx.query.get("categoria") ?? undefined,
        ativo,
        emAberto,
      }));
    },
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<CriarDespesaBody>(ctx.req);
      const syncRastreame = parseSyncRastreameBody(
        body.syncRastreame,
        parseSyncRastreameQuery(ctx.query.get("syncRastreame")),
      );
      const r = await despesasService.criarDespesa(
        body.veiculoId,
        body.despesa,
        { syncRastreame },
      );
      json(ctx.res, 201, r);
    }),
  });

  const one = compileRoute("/api/despesas/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = despesasService.obterDespesa(ctx.params.id);
      if (!item) return notFound(ctx, "Despesa");
      json(ctx.res, 200, { data: item });
    },
  });

  routes.push({
    method: "PATCH",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ClienteDespesaPatch & { syncRastreame?: boolean }>(ctx.req);
      const syncRastreame = parseSyncRastreameBody(
        body.syncRastreame,
        parseSyncRastreameQuery(ctx.query.get("syncRastreame")),
      );
      const { syncRastreame: _s, ...patch } = body;
      const r = await despesasService.atualizarDespesa(ctx.params.id, patch, { syncRastreame });
      json(ctx.res, 200, r);
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const syncRastreame = parseSyncRastreameQuery(ctx.query.get("syncRastreame"));
      const data = await despesasService.removerDespesa(ctx.params.id, { syncRastreame });
      json(ctx.res, 200, { data });
    }),
  });

  const confirmar = compileRoute("/api/despesas/:id/confirmar-condutor");
  routes.push({
    method: "POST",
    pattern: confirmar.regex,
    paramNames: confirmar.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<ConfirmarCondutorBody>(ctx.req);
      const syncRastreame = parseSyncRastreameBody(
        body.syncRastreame,
        parseSyncRastreameQuery(ctx.query.get("syncRastreame")),
      );
      const data = await despesasService.confirmarCondutorDespesa(
        ctx.params.id,
        body.condutorId,
        { syncRastreame },
      );
      json(ctx.res, 200, { data });
    }),
  });
}
