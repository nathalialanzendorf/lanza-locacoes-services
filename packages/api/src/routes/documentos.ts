import {
  badRequest,
  compileRoute,
  handleServiceError,
  json,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as documentos from "../services/documentos.js";

export function registerDocumentosRoutes(routes: RouteDef[]): void {
  const status = compileRoute("/api/documentos/status");
  routes.push({
    method: "GET",
    pattern: status.regex,
    paramNames: status.paramNames,
    handler: (ctx) => json(ctx.res, 200, documentos.statusDocumentos()),
  });

  const list = compileRoute("/api/documentos");
  routes.push({
    method: "GET",
    pattern: list.regex,
    paramNames: list.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const data = await documentos.listarDocumentos({
          prefix: ctx.query.get("prefix") ?? undefined,
          limit: ctx.query.get("limit") ? Number(ctx.query.get("limit")) : undefined,
          cursor: ctx.query.get("cursor") ?? undefined,
        });
        json(ctx.res, 200, data);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const meta = compileRoute("/api/documentos/info");
  routes.push({
    method: "GET",
    pattern: meta.regex,
    paramNames: meta.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const pathname = ctx.query.get("pathname")?.trim();
        if (!pathname) return badRequest(ctx, 'Query "pathname" é obrigatória');
        const blob = await documentos.obterDocumento(pathname);
        if (!blob) {
          json(ctx.res, 404, { error: "Documento não encontrado" });
          return;
        }
        json(ctx.res, 200, blob);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const download = compileRoute("/api/documentos/download");
  routes.push({
    method: "GET",
    pattern: download.regex,
    paramNames: download.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const pathname = ctx.query.get("pathname")?.trim();
        if (!pathname) return badRequest(ctx, 'Query "pathname" é obrigatória');
        const buf = await documentos.lerDocumentoBytes(pathname);
        if (!buf) {
          json(ctx.res, 404, { error: "Documento não encontrado" });
          return;
        }
        const blob = await documentos.obterDocumento(pathname);
        const contentType = blob?.contentType ?? "application/octet-stream";
        const filename = pathname.split("/").pop() ?? "download";
        ctx.res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": buf.length,
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
        ctx.res.end(buf);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const upload = compileRoute("/api/documentos");
  routes.push({
    method: "POST",
    pattern: upload.regex,
    paramNames: upload.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const body = await readJsonBody<{
          pathname: string;
          conteudo: string;
          contentType?: string;
          tipo?: string;
          clienteId?: string;
          placa?: string;
        }>(ctx.req);
        if (!body.pathname?.trim()) return badRequest(ctx, "pathname é obrigatório");
        if (body.conteudo == null) return badRequest(ctx, "conteudo é obrigatório");
        const stored = await documentos.enviarDocumento(body);
        json(ctx.res, 201, stored);
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });

  const del = compileRoute("/api/documentos/remover");
  routes.push({
    method: "DELETE",
    pattern: del.regex,
    paramNames: del.paramNames,
    handler: routeAsync(async (ctx) => {
      try {
        const pathname = ctx.query.get("pathname")?.trim();
        if (!pathname) return badRequest(ctx, 'Query "pathname" é obrigatória');
        const ok = await documentos.removerDocumento(pathname);
        json(ctx.res, ok ? 200 : 404, ok ? { ok: true } : { error: "Documento não encontrado" });
      } catch (err) {
        handleServiceError(ctx, err);
      }
    }),
  });
}
