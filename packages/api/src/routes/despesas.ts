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

type ConfirmarClienteBody = {
  clienteId?: string | null;
  /** @deprecated use clienteId */
  condutorId?: string | null;
  syncRastreame?: boolean;
};

function clienteIdDoBody(body: ConfirmarClienteBody): string | null | undefined {
  if (body.clienteId !== undefined) return body.clienteId;
  return body.condutorId;
}

export function registerDespesasRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/despesas");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      const emAberto = parseEmAbertoQuery(ctx.query.get("emAberto"));
      const semCondutor = parseAtivoQuery(ctx.query.get("semCondutor"));
      const semCliente = parseAtivoQuery(ctx.query.get("semCliente"));

      if (ctx.query.has("ativo") && ativo === undefined) {
        return badRequest(ctx, 'Query "ativo" inválida — use true ou false');
      }
      if (ctx.query.has("emAberto") && emAberto === undefined) {
        return badRequest(ctx, 'Query "emAberto" inválida — use true ou false');
      }

      json(ctx.res, 200, await despesasService.listarDespesasAsync({
        clienteId: ctx.query.get("clienteId") ?? undefined,
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        placa: ctx.query.get("placa") ?? undefined,
        categoria: ctx.query.get("categoria") ?? undefined,
        competencia: ctx.query.get("competencia") ?? undefined,
        dataInicial: ctx.query.get("dataInicial") ?? undefined,
        dataFinal: ctx.query.get("dataFinal") ?? undefined,
        ativo,
        emAberto,
        semCliente: semCliente === true || semCondutor === true ? true : undefined,
      }));
    }),
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
    handler: routeAsync(async (ctx) => {
      const item = await despesasService.obterDespesaAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Despesa");
      json(ctx.res, 200, { data: item });
    }),
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

  const confirmarHandler = routeAsync(async (ctx) => {
      const body = await readJsonBody<ConfirmarClienteBody>(ctx.req);
      const syncRastreame = parseSyncRastreameBody(
        body.syncRastreame,
        parseSyncRastreameQuery(ctx.query.get("syncRastreame")),
      );
      const data = await despesasService.confirmarClienteDespesa(
        ctx.params.id,
        clienteIdDoBody(body),
        { syncRastreame },
      );
      json(ctx.res, 200, { data });
    });

  const confirmar = compileRoute("/api/despesas/:id/confirmar-cliente");
  routes.push({
    method: "POST",
    pattern: confirmar.regex,
    paramNames: confirmar.paramNames,
    handler: confirmarHandler,
  });

  const confirmarLegado = compileRoute("/api/despesas/:id/confirmar-condutor");
  routes.push({
    method: "POST",
    pattern: confirmarLegado.regex,
    paramNames: confirmarLegado.paramNames,
    handler: confirmarHandler,
  });

  const confirmarParceiro = compileRoute("/api/despesas/:id/confirmar-parceiro");
  routes.push({
    method: "POST",
    pattern: confirmarParceiro.regex,
    paramNames: confirmarParceiro.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ parceiroId?: string | null }>(ctx.req).catch(
        (): { parceiroId?: string | null } => ({}),
      );
      const item = await despesasService.obterDespesaAsync(ctx.params.id);
      if (!item) return notFound(ctx, "Despesa");
      const data = await despesasService.confirmarParceiroDespesa(
        item.autoInfracao,
        body.parceiroId,
      );
      json(ctx.res, 200, { data });
    }),
  });

  const atribuir = compileRoute("/api/despesas/atribuir-clientes");
  routes.push({
    method: "POST",
    pattern: atribuir.regex,
    paramNames: atribuir.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          dryRun?: boolean;
          placa?: string;
          prazoDias?: number;
        }>(ctx.req).catch(() => ({}));
        const data = await despesasService.atribuirClientesDespesas(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
