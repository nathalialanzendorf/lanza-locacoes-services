import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  notFound,
  parseAtivoQuery,
  parseEmAbertoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as infracoesService from "../services/infracoes.js";

export function registerInfracoesRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/infracoes");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: (ctx) => {
      const emAberto = parseEmAbertoQuery(ctx.query.get("emAberto"));
      const ativo = parseAtivoQuery(ctx.query.get("ativo"));
      const semCondutor = parseAtivoQuery(ctx.query.get("semCondutor"));
      json(ctx.res, 200, infracoesService.listarInfracoes({
        placa: ctx.query.get("placa") ?? undefined,
        veiculoId: ctx.query.get("veiculoId") ?? undefined,
        emAberto,
        ativo,
        semCondutor: semCondutor === true ? true : undefined,
      }));
    },
  });

  const one = compileRoute("/api/infracoes/:numeroAuto");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: (ctx) => {
      const item = infracoesService.obterInfracao(ctx.params.numeroAuto);
      if (!item) return notFound(ctx, "Infração");
      json(ctx.res, 200, { data: item });
    },
  });

  const confirmarParceiro = compileRoute("/api/infracoes/:numeroAuto/confirmar-parceiro");
  routes.push({
    method: "POST",
    pattern: confirmarParceiro.regex,
    paramNames: confirmarParceiro.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ parceiroId?: string | null }>(ctx.req).catch(
        (): { parceiroId?: string | null } => ({}),
      );
      const data = infracoesService.confirmarParceiroInfracao(
        ctx.params.numeroAuto,
        body.parceiroId,
      );
      json(ctx.res, 200, { data });
    }),
  });

  const vincularDespesa = compileRoute("/api/infracoes/:numeroAuto/vincular-despesa");
  routes.push({
    method: "POST",
    pattern: vincularDespesa.regex,
    paramNames: vincularDespesa.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ clienteDespesaId?: string }>(ctx.req);
      if (!body.clienteDespesaId) {
        return badRequest(ctx, 'Campo "clienteDespesaId" é obrigatório');
      }
      const data = infracoesService.vincularDespesaInfracao(
        ctx.params.numeroAuto,
        body.clienteDespesaId,
      );
      json(ctx.res, 200, { data });
    }),
  });

  const atribuir = compileRoute("/api/infracoes/atribuir-condutores");
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
          incluirPedagios?: boolean;
        }>(ctx.req).catch(() => ({}));
        const data = await infracoesService.atribuirCondutoresInfracoes(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
