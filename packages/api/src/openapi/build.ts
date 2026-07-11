import { API_VERSION, apiHost, apiPort } from "../config.js";
import { openApiComponents } from "./components.js";
import { buildOpenApiPaths } from "./paths.js";
import type { OpenApiDocument } from "./types.js";

function publicServerUrl(): string {
  const fromEnv = process.env.LANZA_API_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `http://${apiHost()}:${apiPort()}`;
}

export function buildOpenApiDocument(): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: {
      title: "Lanza API",
      version: API_VERSION,
      description: [
        "API HTTP do repositório **Aworklanza** — expõe CRUD local (`database/*.json`),",
        "relatórios, syncs e integrações (Rastreame, DETRAN, Pedágio, PagBank, FIPE).",
        "",
        "Documentação interativa: [`/api/docs`](/api/docs).",
        "",
        "Autenticação opcional via header `X-API-Key` quando `LANZA_API_KEY` está definida.",
      ].join("\n"),
    },
    servers: [
      {
        url: publicServerUrl(),
        description: "Servidor local (LANZA_API_HOST + LANZA_API_PORT)",
      },
    ],
    tags: [
      { name: "Sistema", description: "Health, meta e resumo" },
      { name: "Clientes", description: "Motoristas / locatários" },
      { name: "Veículos", description: "Frota e início de locações" },
      { name: "Contratos", description: "Locação Word/PDF + contratos.json" },
      { name: "Despesas cliente", description: "Débitos cobráveis do locatário" },
      { name: "Despesas parceiro", description: "IPVA, seguro, manutenção, rastreador" },
      { name: "Locações", description: "Movimentação operacional (locacoes.json)" },
      { name: "Infrações", description: "Multas DETRAN + atribuição de condutor" },
      { name: "Recebimentos", description: "Baixas Rastreame / PagBank" },
      { name: "Relatórios", description: "Cobranças, encerramento, prestação de contas" },
      { name: "Sync", description: "Sincronizações externas (jobs assíncronos)" },
      { name: "Importações", description: "CNH, CRLV, contratos, Rastreame" },
      { name: "Análise cadastro", description: "Triagem BNMP/PF/TJSC" },
      { name: "FIPE", description: "Consulta e atualização de valores" },
      { name: "Parceiros", description: "Proprietários e vínculos" },
      { name: "Renegociação", description: "Débitos Rastreame e parcelas" },
      { name: "Rastreame", description: "API remota motoristas/gastos" },
      { name: "PagBank", description: "Extrato e match de créditos" },
      { name: "Pedágio Digital", description: "Portal pedagiodigital.com" },
    ],
    paths: buildOpenApiPaths(),
    components: openApiComponents as unknown as Record<string, unknown>,
    security: [{ ApiKeyAuth: [] }],
  };
}

/** Rotas públicas (sem API key) relacionadas à documentação. */
export const OPENAPI_PUBLIC_PATHS = new Set([
  "/api/openapi.json",
  "/api/docs",
]);
