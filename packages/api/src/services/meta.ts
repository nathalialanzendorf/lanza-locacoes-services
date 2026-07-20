import fs from "node:fs";
import path from "node:path";

import { getDbBackend, pgQuery, loadJsonDocumentForApi } from "@lanza/db";
import { API_VERSION } from "../config.js";
import { buildOpenApiDocument } from "../openapi/index.js";
import {
  REPO_ROOT,
  RELATORIOS_SYNC_DIR,
  obterRastreameEspelhoConfig,
  readLanzaPaths,
} from "../lib-imports.js";

const DB_FILES = [
  "clientes.json",
  "veiculos.json",
  "contratos.json",
  "cliente-despesas.json",
  "parceiro-despesas.json",
  "infracoes.json",
  "locacoes.json",
] as const;

const STORE_UPDATED_AT_SQL: Record<string, string> = {
  "clientes.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.clientes",
  "veiculos.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.veiculos",
  "contratos.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.contratos",
  "cliente-despesas.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.cliente_despesas",
  "parceiro-despesas.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.parceiro_despesas",
  "infracoes.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.infracoes",
  "locacoes.json":
    "SELECT COALESCE(to_char(MAX(atualizado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD'), to_char(MAX(cadastrado_em AT TIME ZONE 'UTC'), 'YYYY-MM-DD')) AS d FROM lanza.locacoes",
};

async function dbTimestampAsync(file: string): Promise<string | null> {
  const p = path.join(REPO_ROOT, "database", file);
  if (getDbBackend() !== "file") {
    const sql = STORE_UPDATED_AT_SQL[file];
    if (sql) {
      try {
        const r = await pgQuery<{ d: string | null }>(sql);
        const d = r.rows[0]?.d;
        if (d) return d;
      } catch {
        /* fallback abaixo */
      }
    }
  }
  try {
    const raw = await loadJsonDocumentForApi<{ atualizadoEm?: string }>(p, {});
    if (raw.atualizadoEm) return raw.atualizadoEm;
  } catch {
    /* fallback abaixo */
  }
  if (fs.existsSync(p)) {
    try {
      return fs.statSync(p).mtime.toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function dbTimestamp(file: string): string | null {
  const p = path.join(REPO_ROOT, "database", file);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { atualizadoEm?: string };
    return raw.atualizadoEm ?? fs.statSync(p).mtime.toISOString();
  } catch {
    return fs.statSync(p).mtime.toISOString();
  }
}

function ultimosRelatoriosSync(limit = 5): { arquivo: string; modificado: string }[] {
  const dir = RELATORIOS_SYNC_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = path.join(dir, f);
      return { arquivo: f, modificado: fs.statSync(p).mtime.toISOString() };
    })
    .sort((a, b) => (a.modificado < b.modificado ? 1 : -1))
    .slice(0, limit);
}

function buildMeta(database: Record<string, string | null>) {
  const doc = buildOpenApiDocument();
  return {
    apiVersion: API_VERSION,
    openapi: {
      spec: "/api/openapi.json",
      docs: "/api/docs",
      operations: Object.values(doc.paths).reduce(
        (n, item) => n + Object.keys(item).length,
        0,
      ),
    },
    repoRoot: REPO_ROOT,
    paths: readLanzaPaths(),
    rastreameEspelho: obterRastreameEspelhoConfig(),
    database,
    ultimosSyncs: ultimosRelatoriosSync(),
  };
}

export function obterMeta() {
  return buildMeta({
    clientes: dbTimestamp("clientes.json"),
    veiculos: dbTimestamp("veiculos.json"),
    contratos: dbTimestamp("contratos.json"),
    clienteDespesas: dbTimestamp("cliente-despesas.json"),
    parceiroDespesas: dbTimestamp("parceiro-despesas.json"),
    infracoes: dbTimestamp("infracoes.json"),
    locacoes: dbTimestamp("locacoes.json"),
  });
}

export async function obterMetaAsync() {
  const [
    clientes,
    veiculos,
    contratos,
    clienteDespesas,
    parceiroDespesas,
    infracoes,
    locacoes,
  ] = await Promise.all(DB_FILES.map((file) => dbTimestampAsync(file)));
  return buildMeta({
    clientes,
    veiculos,
    contratos,
    clienteDespesas,
    parceiroDespesas,
    infracoes,
    locacoes,
  });
}
