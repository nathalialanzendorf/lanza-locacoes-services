import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as rastreameService from "../services/rastreame.js";

/** @deprecated Integração Rastreame descontinuada — rotas mantidas só por compatibilidade. */
export function registerRastreameRoutes(routes: RouteDef[]): void {
  const auth = compileRoute("/api/rastreame/auth");
  routes.push({
    method: "GET",
    pattern: auth.regex,
    paramNames: auth.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await rastreameService.statusAuthRastreame();
      json(ctx.res, 200, data);
    }),
  });

  const login = compileRoute("/api/rastreame/login");
  routes.push({
    method: "POST",
    pattern: login.regex,
    paramNames: login.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ save?: boolean }>(ctx.req).catch(
        (): { save?: boolean } => ({}),
      );
      const data = await rastreameService.loginRastreameApi(body.save === true);
      json(ctx.res, 200, data);
    }),
  });

  const check = compileRoute("/api/rastreame/motoristas/check");
  routes.push({
    method: "GET",
    pattern: check.regex,
    paramNames: check.paramNames,
    handler: routeAsync(async (ctx) => {
      const cnh = ctx.query.get("cnh");
      if (!cnh) return badRequest(ctx, 'Query "cnh" é obrigatória');
      const data = await rastreameService.verificarMotoristaRastreame(
        cnh,
        ctx.query.get("nome") ?? "",
      );
      json(ctx.res, 200, data);
    }),
  });

  const motoristas = compileRoute("/api/rastreame/motoristas");
  routes.push({
    method: "GET",
    pattern: motoristas.regex,
    paramNames: motoristas.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await rastreameService.listarMotoristasRastreame();
      json(ctx.res, 200, data);
    }),
  });

  routes.push({
    method: "POST",
    pattern: motoristas.regex,
    paramNames: motoristas.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<Record<string, unknown>>(ctx.req);
      const data = await rastreameService.upsertMotoristaRastreame(body);
      json(ctx.res, 200, { data });
    }),
  });

  const gastos = compileRoute("/api/rastreame/gastos");
  routes.push({
    method: "GET",
    pattern: gastos.regex,
    paramNames: gastos.paramNames,
    handler: routeAsync(async (ctx) => {
      const page = ctx.query.get("page");
      const size = ctx.query.get("size");
      const data = await rastreameService.listarGastosRastreame({
        page: page != null ? Number(page) : undefined,
        size: size != null ? Number(size) : undefined,
        dataInicial: ctx.query.get("dataInicial") ?? undefined,
        dataFinal: ctx.query.get("dataFinal") ?? undefined,
      });
      json(ctx.res, 200, data);
    }),
  });

  routes.push({
    method: "POST",
    pattern: gastos.regex,
    paramNames: gastos.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<unknown>(ctx.req);
      const data = await rastreameService.criarGastoRastreame(body);
      json(ctx.res, 201, data);
    }),
  });

  const gastoOne = compileRoute("/api/rastreame/gastos/:id");
  routes.push({
    method: "GET",
    pattern: gastoOne.regex,
    paramNames: gastoOne.paramNames,
    handler: routeAsync(async (ctx) => {
      const data = await rastreameService.obterGastoRastreame(ctx.params.id);
      json(ctx.res, 200, { data });
    }),
  });

  routes.push({
    method: "PUT",
    pattern: gastoOne.regex,
    paramNames: gastoOne.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<unknown>(ctx.req);
      const data = await rastreameService.atualizarGastoRastreame(ctx.params.id, body);
      json(ctx.res, 200, data);
    }),
  });

  const lancarSemanal = compileRoute("/api/rastreame/lancar-semanal");
  routes.push({
    method: "POST",
    pattern: lancarSemanal.regex,
    paramNames: lancarSemanal.paramNames,
    /** @deprecated Lançamento em lote descontinuado — próxima semana é criada na baixa/contrato. */
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          inicio?: string;
          fim?: string;
          prazoDias?: number;
          execute?: boolean;
          info?: string;
          dataIso?: string;
        }>(ctx.req);
        if (!body.inicio || !body.fim) {
          return badRequest(ctx, 'Campos "inicio" e "fim" (YYYY-MM-DD) são obrigatórios');
        }
        const data = await rastreameService.lancarPagamentosSemanais({
          inicio: body.inicio,
          fim: body.fim,
          prazoDias: body.prazoDias,
          execute: body.execute,
          info: body.info,
          dataIso: body.dataIso,
        });
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
