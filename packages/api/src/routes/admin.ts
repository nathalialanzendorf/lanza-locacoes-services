import type { IncomingMessage } from "node:http";

import {
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as migrateDb from "../services/migrateDb.js";

function migrateAuthorized(req: IncomingMessage, bootstrapAllowed: boolean): boolean {
  const secret = String(req.headers["x-migrate-secret"] ?? "").trim();
  const expected = process.env.LANZA_MIGRATE_SECRET?.trim();
  if (expected && secret === expected) return true;
  return bootstrapAllowed;
}

function adminSecretAuthorized(req: IncomingMessage): boolean {
  const secret = String(req.headers["x-migrate-secret"] ?? "").trim();
  const expected = process.env.LANZA_MIGRATE_SECRET?.trim();
  return !!(expected && secret === expected);
}

export function registerAdminRoutes(routes: RouteDef[]): void {
  const status = compileRoute("/api/admin/db-status");
  routes.push({
    method: "GET",
    pattern: status.regex,
    paramNames: status.paramNames,
    handler: routeAsync(async (ctx) => {
      json(ctx.res, 200, await migrateDb.obterDbAdminStatus());
    }),
  });

  const migrar = compileRoute("/api/admin/migrar");
  routes.push({
    method: "POST",
    pattern: migrar.regex,
    paramNames: migrar.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const dbStatus = await migrateDb.obterDbAdminStatus();
        if (!migrateAuthorized(ctx.req, dbStatus.bootstrapAllowed)) {
          json(ctx.res, 401, {
            error:
              "Não autorizado. Use header X-Migrate-Secret (LANZA_MIGRATE_SECRET) ou migração bootstrap com Postgres vazio.",
          });
          return;
        }

        const body = await readJsonBody<{
          importJson?: boolean;
          dryRun?: boolean;
          stores?: string[];
        }>(ctx.req);
        const result = await migrateDb.executarMigracaoDb({
          importJson: body.importJson,
          dryRun: body.dryRun,
          stores: body.stores,
        });
        json(ctx.res, 200, result);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const postgresPassword = compileRoute("/api/admin/postgres-password");
  routes.push({
    method: "POST",
    pattern: postgresPassword.regex,
    paramNames: postgresPassword.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        if (!adminSecretAuthorized(ctx.req)) {
          json(ctx.res, 401, {
            error: "Não autorizado. Header X-Migrate-Secret (LANZA_MIGRATE_SECRET na Vercel).",
          });
          return;
        }
        const body = await readJsonBody<{ password?: string }>(ctx.req);
        const password = body.password?.trim();
        if (!password) {
          json(ctx.res, 400, { error: "Informe { \"password\": \"...\" } (mínimo 8 caracteres)." });
          return;
        }
        const result = await migrateDb.definirSenhaPostgresMaster(password);
        json(ctx.res, 200, { ok: true, ...result });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
