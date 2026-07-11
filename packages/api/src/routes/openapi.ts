import { compileRoute, json, type RouteDef } from "../http.js";
import { buildOpenApiDocument } from "../openapi/index.js";

function swaggerUiHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lanza API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>body { margin: 0; background: #fafafa; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;
}

export function registerOpenApiRoutes(routes: RouteDef[]): void {
  const spec = compileRoute("/api/openapi.json");
  routes.push({
    method: "GET",
    pattern: spec.regex,
    paramNames: spec.paramNames,
    handler: (ctx) => {
      json(ctx.res, 200, buildOpenApiDocument());
    },
  });

  const docs = compileRoute("/api/docs");
  routes.push({
    method: "GET",
    pattern: docs.regex,
    paramNames: docs.paramNames,
    handler: (ctx) => {
      const html = swaggerUiHtml("/api/openapi.json");
      ctx.res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html),
      });
      ctx.res.end(html);
    },
  });
}
