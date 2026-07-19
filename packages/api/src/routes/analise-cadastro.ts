import {
  badRequest,
  compileRoute,
  json,
  notFound,
  parseAtivoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as analiseService from "../services/analiseCadastro.js";
import { createJob, getJob, runJobAsync } from "../services/sync/jobs.js";

function parseBoolQuery(raw: string | null, fallback = false): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "sim") return true;
  if (v === "false" || v === "0" || v === "nao" || v === "não") return false;
  return fallback;
}

export function registerAnaliseCadastroRoutes(routes: RouteDef[]): void {
  const list = compileRoute("/api/analise-cadastro");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const comAlerta = parseAtivoQuery(ctx.query.get("comAlerta"));
      const data = await analiseService.listarAnalisesCadastro({
        cpf: ctx.query.get("cpf") ?? undefined,
        comAlerta: comAlerta === true ? true : undefined,
      });
      json(ctx.res, 200, data);
    }),
  });

  routes.push({
    method: "POST",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<analiseService.AnaliseCadastroInput>(ctx.req);
      const asyncMode = parseBoolQuery(ctx.query.get("async"), body.semBrowser !== true);

      if (asyncMode && !body.semBrowser) {
        const job = createJob("analise-cadastro", body);
        runJobAsync(job.id, () => analiseService.executarAnaliseCadastro(body));
        json(ctx.res, 202, { jobId: job.id, status: job.status });
        return;
      }

      const data = await analiseService.executarAnaliseCadastro(body);
      json(ctx.res, 200, { data });
    }),
  });

  const decisao = compileRoute("/api/analise-cadastro/:id/decisao");
  routes.push({
    method: "PATCH",
    pattern: decisao.regex,
    paramNames: decisao.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<{ aprovado?: boolean }>(ctx.req);
      if (body.aprovado !== true && body.aprovado !== false) {
        return badRequest(ctx, 'Campo "aprovado" deve ser true ou false');
      }
      const data = await analiseService.registrarDecisaoAnalise(ctx.params.id, body.aprovado);
      json(ctx.res, 200, { data });
    }),
  });

  const jobStatus = compileRoute("/api/analise-cadastro/jobs/:id");
  routes.push({
    method: "GET",
    pattern: jobStatus.regex,
    paramNames: jobStatus.paramNames,
    handler: (ctx) => {
      const job = getJob(ctx.params.id);
      if (!job) return notFound(ctx, "Job");
      json(ctx.res, 200, job);
    },
  });

  const one = compileRoute("/api/analise-cadastro/:id");
  routes.push({
    method: "GET",
    pattern: one.regex,
    paramNames: one.paramNames,
    handler: routeAsync(async (ctx) => {
      const item = await analiseService.obterAnaliseCadastro(ctx.params.id);
      if (!item) return notFound(ctx, "Análise");
      json(ctx.res, 200, { data: item });
    }),
  });
}
