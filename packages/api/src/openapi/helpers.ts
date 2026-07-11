import type { OpenApiOperation, OpenApiPathItem, OpenApiPaths } from "./types.js";

type Param = Record<string, unknown>;
type BodySchema = Record<string, unknown>;

export function op(
  method: string,
  tag: string,
  summary: string,
  opts: {
    operationId: string;
    description?: string;
    parameters?: Param[];
    requestBody?: BodySchema;
    requestBodyRequired?: boolean;
    responses?: Record<string, unknown>;
    security?: Array<Record<string, string[]>>;
  },
): OpenApiOperation {
  const operation: OpenApiOperation = {
    tags: [tag],
    summary,
    operationId: opts.operationId,
    responses: opts.responses ?? {
      "200": { $ref: "#/components/responses/OkJson" },
      "400": { $ref: "#/components/responses/Error" },
      "401": { $ref: "#/components/responses/Unauthorized" },
    },
    security: opts.security ?? [{ ApiKeyAuth: [] }],
  };
  if (opts.description) operation.description = opts.description;
  if (opts.parameters?.length) operation.parameters = opts.parameters;
  if (opts.requestBody) {
    operation.requestBody = {
      required: opts.requestBodyRequired ?? true,
      content: {
        "application/json": { schema: opts.requestBody },
      },
    };
  }
  return operation;
}

export function pathItem(ops: Record<string, OpenApiOperation>): OpenApiPathItem {
  return ops;
}

export function mergePaths(...groups: OpenApiPaths[]): OpenApiPaths {
  return Object.assign({}, ...groups);
}

export function refParam(name: string): Param {
  return { $ref: `#/components/parameters/${name}` };
}

export function query(
  name: string,
  schema: Record<string, unknown>,
  description?: string,
): Param {
  return { name, in: "query", schema, ...(description ? { description } : {}) };
}

export function pathParam(name: string, description?: string): Param {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
    ...(description ? { description } : {}),
  };
}

export function jsonBody(properties: Record<string, unknown>, required?: string[]): BodySchema {
  return {
    type: "object",
    properties,
    ...(required?.length ? { required } : {}),
  };
}
