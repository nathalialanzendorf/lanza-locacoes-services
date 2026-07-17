import {
  badRequest,
  compileRoute,
  json,
  notFound,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import { metaSync, normalizarSyncId } from "../services/sync/catalog.js";
import { createJob, getJob, listJobs, runJobAsync } from "../services/sync/jobs.js";
import {
  executarSync,
  executarSyncCompleto,
  type SyncCompletoInput,
  type SyncInput,
} from "../services/sync/runner.js";

function parseBoolQuery(raw: string | null, fallback = false): boolean {
  if (raw == null || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "sim") return true;
  if (v === "false" || v === "0" || v === "nao" || v === "não") return false;
  return fallback;
}

function parseSyncInput(body: Record<string, unknown>): SyncInput {
  return {
    dryRun: body.dryRun === true,
    placa: typeof body.placa === "string" ? body.placa : undefined,
    pullOnly: body.pullOnly === true,
    pushOnly: body.pushOnly === true,
    forcePull: body.forcePull === true,
    forcePush: body.forcePush === true,
    faltantes: body.faltantes === true,
    motoristaKey: typeof body.motoristaKey === "string" ? body.motoristaKey : undefined,
    ticket: typeof body.ticket === "string" ? body.ticket : undefined,
    captcha: typeof body.captcha === "string" ? body.captcha : undefined,
    jsonPath: typeof body.jsonPath === "string" ? body.jsonPath : undefined,
    prazoDias: typeof body.prazoDias === "number" ? body.prazoDias : undefined,
    delayMs: typeof body.delayMs === "number" ? body.delayMs : undefined,
    noRs: body.noRs === true,
    normalizarTitulos: body.normalizarTitulos === true,
    anos: Array.isArray(body.anos)
      ? body.anos.filter((a): a is string => typeof a === "string")
      : undefined,
    boletosPath: typeof body.boletosPath === "string" ? body.boletosPath : undefined,
    jsonOnly: body.jsonOnly === true,
    categoria: typeof body.categoria === "string" ? body.categoria : undefined,
  };
}

export function registerSyncRoutes(routes: RouteDef[]): void {
  const meta = compileRoute("/api/sync");
  routes.push({
    method: "GET",
    pattern: meta.regex,
    paramNames: meta.paramNames,
    handler: (ctx) => json(ctx.res, 200, metaSync()),
  });

  const jobsList = compileRoute("/api/sync/jobs");
  routes.push({
    method: "GET",
    pattern: jobsList.regex,
    paramNames: jobsList.paramNames,
    handler: (ctx) => {
      const limit = Number(ctx.query.get("limit") ?? "20");
      const jobs = listJobs(Number.isFinite(limit) ? limit : 20);
      json(ctx.res, 200, { total: jobs.length, jobs });
    },
  });

  const jobDetail = compileRoute("/api/sync/jobs/:id");
  routes.push({
    method: "GET",
    pattern: jobDetail.regex,
    paramNames: jobDetail.paramNames,
    handler: (ctx) => {
      const job = getJob(ctx.params.id);
      if (!job) return notFound(ctx, "Job");
      json(ctx.res, 200, job);
    },
  });

  const completo = compileRoute("/api/sync/completo");
  routes.push({
    method: "POST",
    pattern: completo.regex,
    paramNames: completo.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<SyncCompletoInput>(ctx.req).catch(() => ({} as SyncCompletoInput));
      const asyncMode = parseBoolQuery(ctx.query.get("async"), body.async === true);

      if (asyncMode) {
        const job = createJob("completo", body);
        runJobAsync(job.id, () => executarSyncCompleto(body));
        json(ctx.res, 202, { jobId: job.id, status: job.status });
        return;
      }

      const data = await executarSyncCompleto(body);
      json(ctx.res, 200, data);
    }),
  });

  const syncNome = compileRoute("/api/sync/:nome");
  routes.push({
    method: "POST",
    pattern: syncNome.regex,
    paramNames: syncNome.paramNames,
    handler: routeAsync(async (ctx) => {
      const nome = ctx.params.nome;
      const syncId = normalizarSyncId(nome);
      if (!syncId) {
        return badRequest(ctx, `Sync desconhecido: ${nome}`);
      }

      const body: Record<string, unknown> = await readJsonBody<Record<string, unknown>>(ctx.req).catch(
        () => ({}),
      );
      const input = parseSyncInput(body);
      const asyncMode = parseBoolQuery(ctx.query.get("async"), body.async === true);

      if (asyncMode) {
        const job = createJob(syncId, input);
        runJobAsync(job.id, () => executarSync(syncId, input));
        json(ctx.res, 202, { jobId: job.id, status: job.status, sync: syncId });
        return;
      }

      const data = await executarSync(syncId, input);
      json(ctx.res, 200, data);
    }),
  });
}
