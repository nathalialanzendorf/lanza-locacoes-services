/** Componentes reutilizáveis do documento OpenAPI. */
export const openApiComponents = {
  securitySchemes: {
    BearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        "Token obtido em `POST /api/auth/login` ou `POST /api/auth/register`. Requer `LANZA_JWT_SECRET` no servidor.",
    },
    ApiKeyAuth: {
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
      description:
        "Opcional em desenvolvimento. Quando `LANZA_API_KEY` está definida, todas as rotas `/api/*` exigem este header.",
    },
  },
  parameters: {
    IdPath: {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    PlacaQuery: {
      name: "placa",
      in: "query",
      schema: { type: "string" },
      description: "Placa (com ou sem hífen).",
    },
    AtivoQuery: {
      name: "ativo",
      in: "query",
      schema: { type: "boolean" },
      description: "Filtrar por status ativo (`true`/`false`, `1`/`0`, `sim`/`nao`).",
    },
    EmAbertoQuery: {
      name: "emAberto",
      in: "query",
      schema: { type: "boolean" },
    },
    PaginaQuery: {
      name: "page",
      in: "query",
      schema: { type: "integer", minimum: 0 },
    },
    InicioDateQuery: {
      name: "inicio",
      in: "query",
      schema: { type: "string", format: "date" },
      description: "Data inicial (YYYY-MM-DD).",
    },
    FimDateQuery: {
      name: "fim",
      in: "query",
      schema: { type: "string", format: "date" },
      description: "Data final (YYYY-MM-DD).",
    },
    DryRunBody: {
      type: "object",
      properties: {
        dryRun: { type: "boolean", description: "Simula sem gravar alterações." },
      },
    },
  },
  schemas: {
    Error: {
      type: "object",
      required: ["error"],
      properties: { error: { type: "string" } },
    },
    Health: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        service: { type: "string", example: "@lanza/api" },
        version: { type: "string" },
      },
    },
    ListEnvelope: {
      type: "object",
      properties: {
        total: { type: "integer" },
        items: { type: "array", items: { type: "object" } },
      },
    },
    DataEnvelope: {
      type: "object",
      properties: { data: { type: "object" } },
    },
    JobEnvelope: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        status: { type: "string", enum: ["pending", "running", "done", "error"] },
        result: { type: "object" },
        error: { type: "string" },
      },
    },
  },
  responses: {
    Error: {
      description: "Erro",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    NotFound: {
      description: "Recurso não encontrado",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    Unauthorized: {
      description: "API key inválida ou ausente",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    OkJson: {
      description: "Sucesso",
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
    OkList: {
      description: "Lista paginada",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ListEnvelope" },
        },
      },
    },
    Created: {
      description: "Criado",
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
  },
} as const;
