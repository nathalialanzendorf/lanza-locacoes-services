import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiContext = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  method: string;
  path: string;
};

export type ApiHandler = (ctx: ApiContext) => void | Promise<void>;

export type RouteDef = {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: ApiHandler;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

export function handleServiceError(ctx: ApiContext, err: unknown): void {
  if (err instanceof HttpError) {
    json(ctx.res, err.status, { error: err.message });
    return;
  }
  if (err instanceof Error) {
    json(ctx.res, 400, { error: err.message });
    return;
  }
  json(ctx.res, 500, { error: "Erro interno do servidor" });
}

export function parseAtivoQuery(raw: string | null): boolean | undefined {
  if (raw == null || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "sim") return true;
  if (v === "false" || v === "0" || v === "nao" || v === "não") return false;
  return undefined;
}

export function parseEmAbertoQuery(raw: string | null): boolean | undefined {
  return parseAtivoQuery(raw);
}

export function notFound(ctx: ApiContext, recurso: string): void {
  json(ctx.res, 404, { error: `${recurso} não encontrado` });
}

export function badRequest(ctx: ApiContext, mensagem: string): void {
  json(ctx.res, 400, { error: mensagem });
}

export function compileRoute(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const parts = pattern.split("/").filter(Boolean);
  const regexParts = parts.map((part) => {
    if (part.startsWith(":")) {
      paramNames.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return {
    regex: new RegExp(`^/${regexParts.join("/")}/?$`),
    paramNames,
  };
}

export function matchRoute(
  routes: RouteDef[],
  method: string,
  pathname: string,
): { handler: ApiHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = pathname.match(route.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1] ?? "");
    });
    return { handler: route.handler, params };
  }
  return null;
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) {
    throw new HttpError(400, "Corpo JSON vazio");
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

export function parseSyncRastreameQuery(raw: string | null): boolean {
  if (raw == null || raw === "") return true;
  const v = raw.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "nao" || v === "não");
}

export function parseSyncRastreameBody(value: unknown, fallback = true): boolean {
  if (value === undefined) return fallback;
  if (value === false) return false;
  if (value === true) return true;
  if (typeof value === "string") return parseSyncRastreameQuery(value);
  return fallback;
}
