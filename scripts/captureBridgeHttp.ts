import type { IncomingMessage, ServerResponse } from "node:http";

export type CaptureStartParams = {
  apiUrl: string;
  bearer?: string;
  apiKey?: string;
};

export function bridgeCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

export function bridgeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  bridgeCors(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function bridgeHtml(res: ServerResponse, status: number, html: string): void {
  bridgeCors(res);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

export async function bridgeReadBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export async function parseCaptureStartRequest(
  req: IncomingMessage,
  url: URL,
): Promise<CaptureStartParams> {
  if (req.method === "GET") {
    return {
      apiUrl: url.searchParams.get("apiUrl")?.trim() ?? "",
      bearer: url.searchParams.get("bearer") ?? undefined,
      apiKey: url.searchParams.get("apiKey") ?? undefined,
    };
  }
  const body = await bridgeReadBody(req);
  return {
    apiUrl: typeof body.apiUrl === "string" ? body.apiUrl.trim() : "",
    bearer: typeof body.bearer === "string" ? body.bearer : undefined,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
  };
}

export function bridgeCaptureStartHtml(title: string, initialMessage: string): string {
  const msg = initialMessage.replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 2rem auto; padding: 0 1rem; }
    .ok { color: #0a7; } .err { color: #c33; } .muted { color: #666; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p id="msg">${msg}</p>
  <p class="muted" id="status">A aguardar…</p>
  <script>
    async function poll() {
      try {
        const r = await fetch("/capture/status");
        const j = await r.json();
        const d = j.data || {};
        document.getElementById("status").textContent = d.message || d.status || "…";
        if (d.status === "captured") {
          document.getElementById("msg").innerHTML = '<span class="ok">Sessão capturada e enviada à API. Pode fechar esta aba.</span>';
        } else if (d.status === "error") {
          document.getElementById("msg").innerHTML = '<span class="err">' + (d.message || "Erro na captura") + '</span>';
        }
      } catch (e) {
        document.getElementById("status").textContent = "Erro ao consultar status";
      }
    }
    poll();
    setInterval(poll, 2000);
  </script>
</body>
</html>`;
}

export function respondCaptureStart(
  req: IncomingMessage,
  res: ServerResponse,
  data: { message?: string; status?: string },
  htmlTitle: string,
): void {
  const accept = String(req.headers.accept ?? "");
  if (req.method === "GET" || accept.includes("text/html")) {
    bridgeHtml(res, 200, bridgeCaptureStartHtml(htmlTitle, data.message ?? "Chrome aberto — faça login no portal."));
    return;
  }
  bridgeJson(res, 200, { data });
}

export async function persistSessionToRemoteApi(
  apiUrl: string,
  path: string,
  session: unknown,
  bearer?: string,
  apiKey?: string,
): Promise<void> {
  const base = apiUrl.replace(/\/+$/, "");
  if (!base) {
    throw new Error("apiUrl em falta — configure a URL da API na app.");
  }
  if (!bearer?.trim() && !apiKey?.trim()) {
    throw new Error(
      "Autenticação em falta — faça login na app (ou configure a API key) antes de capturar a sessão.",
    );
  }

  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (bearer?.trim()) headers.Authorization = `Bearer ${bearer.trim()}`;
  if (apiKey?.trim()) headers["X-API-Key"] = apiKey.trim();

  const body = JSON.stringify(session);
  const timeoutMs = 45_000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers,
        body,
        signal: ac.signal,
      });
      if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
          const j = (await r.json()) as { error?: string };
          if (j.error) detail = j.error;
        } catch {
          /* ignore */
        }
        if (r.status === 401) {
          throw new Error(
            `API recusou o pedido (${detail}) — faça login de novo na app e repita a captura.`,
          );
        }
        throw new Error(`API remota respondeu: ${detail}`);
      }
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        attempt < 2 &&
        (msg.includes("fetch failed") ||
          msg.includes("aborted") ||
          msg.includes("ECONNRESET") ||
          msg.includes("ETIMEDOUT"));
      if (!retryable) break;
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }

  const detail =
    lastErr instanceof Error
      ? lastErr.cause instanceof Error
        ? lastErr.cause.message
        : lastErr.message
      : String(lastErr);
  throw new Error(
    `Não foi possível guardar a sessão em ${url} (${detail}). Verifique internet e login na app; use Colagem manual se persistir.`,
  );
}
