import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as portaisService from "../services/portais.js";

export function registerPortaisRoutes(routes: RouteDef[]): void {
  const detranScSessao = compileRoute("/api/portais/detran-sc/sessao");

  routes.push({
    method: "GET",
    pattern: detranScSessao.regex,
    paramNames: detranScSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.statusDetranScSessao();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "PUT",
    pattern: detranScSessao.regex,
    paramNames: detranScSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          auth?: string;
          empresa?: string;
          appVersion?: string | null;
        }>(ctx.req);
        const data = await portaisService.gravarDetranScSessao(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: detranScSessao.regex,
    paramNames: detranScSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const status = await portaisService.statusDetranScSessao();
        if (status.origem === "env") {
          return badRequest(
            ctx,
            "Sessão DETRAN SC controlada por variáveis de ambiente no servidor — remova DETRAN_SC_AUTH/DETRAN_SC_EMPRESA para usar o store.",
          );
        }
        const data = await portaisService.removerDetranScSessao();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const detranScCaptura = compileRoute("/api/portais/detran-sc/captura");

  routes.push({
    method: "GET",
    pattern: detranScCaptura.regex,
    paramNames: detranScCaptura.paramNames,
    handler: (ctx) => {
      json(ctx.res, 200, { data: portaisService.statusCapturaDetranSc() });
    },
  });

  routes.push({
    method: "POST",
    pattern: detranScCaptura.regex,
    paramNames: detranScCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.iniciarCapturaDetranSc();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: detranScCaptura.regex,
    paramNames: detranScCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.pararCapturaDetranSc();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const sigapaySessao = compileRoute("/api/portais/sigapay/sessao");

  routes.push({
    method: "GET",
    pattern: sigapaySessao.regex,
    paramNames: sigapaySessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.statusSigapaySessao();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "PUT",
    pattern: sigapaySessao.regex,
    paramNames: sigapaySessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          cookie?: string;
          token?: string;
          apiBase?: string | null;
        }>(ctx.req);
        const data = await portaisService.gravarSigapaySessao(body);
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: sigapaySessao.regex,
    paramNames: sigapaySessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const status = await portaisService.statusSigapaySessao();
        if (status.origem === "env") {
          return badRequest(
            ctx,
            "Sessão SigaPay controlada por variáveis de ambiente no servidor — remova SIGAPAY_COOKIE/SIGAPAY_TOKEN para usar o store.",
          );
        }
        const data = await portaisService.removerSigapaySessao();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const sigapayCaptura = compileRoute("/api/portais/sigapay/captura");

  routes.push({
    method: "GET",
    pattern: sigapayCaptura.regex,
    paramNames: sigapayCaptura.paramNames,
    handler: (ctx) => {
      json(ctx.res, 200, { data: portaisService.statusCapturaSigapay() });
    },
  });

  routes.push({
    method: "POST",
    pattern: sigapayCaptura.regex,
    paramNames: sigapayCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.iniciarCapturaSigapay();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  routes.push({
    method: "DELETE",
    pattern: sigapayCaptura.regex,
    paramNames: sigapayCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await portaisService.pararCapturaSigapay();
        json(ctx.res, 200, { data });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const pedagioSessao = compileRoute("/api/portais/pedagio/sessao");
  routes.push({
    method: "GET",
    pattern: pedagioSessao.regex,
    paramNames: pedagioSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.statusPedagioSessao() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "PUT",
    pattern: pedagioSessao.regex,
    paramNames: pedagioSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ cookie?: string; csrf?: string }>(ctx.req);
        json(ctx.res, 200, { data: await portaisService.gravarPedagioSessao(body) });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "DELETE",
    pattern: pedagioSessao.regex,
    paramNames: pedagioSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.removerPedagioSessao() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const pedagioCaptura = compileRoute("/api/portais/pedagio/captura");
  routes.push({
    method: "GET",
    pattern: pedagioCaptura.regex,
    paramNames: pedagioCaptura.paramNames,
    handler: (ctx) => json(ctx.res, 200, { data: portaisService.statusCapturaPedagio() }),
  });
  routes.push({
    method: "POST",
    pattern: pedagioCaptura.regex,
    paramNames: pedagioCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.iniciarCapturaPedagio() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "DELETE",
    pattern: pedagioCaptura.regex,
    paramNames: pedagioCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.pararCapturaPedagio() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const detranRsSessao = compileRoute("/api/portais/detran-rs/sessao");
  routes.push({
    method: "GET",
    pattern: detranRsSessao.regex,
    paramNames: detranRsSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.statusDetranRsSessao() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "PUT",
    pattern: detranRsSessao.regex,
    paramNames: detranRsSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{ auth?: string; userId?: string }>(ctx.req);
        json(ctx.res, 200, { data: await portaisService.gravarDetranRsSessao(body) });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "DELETE",
    pattern: detranRsSessao.regex,
    paramNames: detranRsSessao.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.removerDetranRsSessao() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const detranRsCaptura = compileRoute("/api/portais/detran-rs/captura");
  routes.push({
    method: "GET",
    pattern: detranRsCaptura.regex,
    paramNames: detranRsCaptura.paramNames,
    handler: (ctx) => json(ctx.res, 200, { data: portaisService.statusCapturaDetranRs() }),
  });
  routes.push({
    method: "POST",
    pattern: detranRsCaptura.regex,
    paramNames: detranRsCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.iniciarCapturaDetranRs() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
  routes.push({
    method: "DELETE",
    pattern: detranRsCaptura.regex,
    paramNames: detranRsCaptura.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        json(ctx.res, 200, { data: await portaisService.pararCapturaDetranRs() });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
