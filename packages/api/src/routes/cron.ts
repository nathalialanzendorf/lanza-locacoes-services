import { cronSecret } from "../config.js";
import { compileRoute, handleServiceError, json, routeAsync, type RouteDef } from "../http.js";
import { obterStatusSigapaySession } from "../lib-imports.js";
import { extractBearerToken } from "../services/auth.js";
import { executarSync } from "../services/sync/runner.js";

function unauthorizedCron(ctx: { res: import("node:http").ServerResponse }): void {
  json(ctx.res, 401, { error: "Cron não autorizado — configure CRON_SECRET na Vercel." });
}

function assertCronAuthorized(req: import("node:http").IncomingMessage): boolean {
  const expected = cronSecret();
  if (!expected) return false;
  const token = extractBearerToken(req);
  return Boolean(token && token === expected);
}

export function registerCronRoutes(routes: RouteDef[]): void {
  const estacionamento = compileRoute("/api/cron/sync-estacionamento");
  routes.push({
    method: "GET",
    pattern: estacionamento.regex,
    paramNames: estacionamento.paramNames,
    handler: routeAsync(async (ctx) => {
      if (!assertCronAuthorized(ctx.req)) {
        unauthorizedCron(ctx);
        return;
      }

      const sessao = await obterStatusSigapaySession();
      if (!sessao.configured) {
        json(ctx.res, 503, {
          ok: false,
          error:
            "SigaPay sem sessão no RDS. Rode login-sigapay.ps1 -PushRds ou parseSigapayMitmCapture --push-rds.",
          sessao,
        });
        return;
      }

      try {
        const data = await executarSync("estacionamento", { dryRun: false });
        json(ctx.res, 200, {
          ok: true,
          sync: "estacionamento",
          sessao: { configured: true, updatedAt: sessao.updatedAt, origem: sessao.origem },
          data,
        });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
