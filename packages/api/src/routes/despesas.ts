import {
  badRequest,
  compileRoute,
  json,
  notFound,
  parseAtivoQuery,
  parseEmAbertoQuery,
  type RouteDef,
} from "../http.js";
import * as despesasService from "../services/despesas.js";

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
}
