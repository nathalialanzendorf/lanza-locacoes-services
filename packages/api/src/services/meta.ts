import fs from "node:fs";
import path from "node:path";

import { API_VERSION } from "../config.js";
import {
  REPO_ROOT,
  RELATORIOS_SYNC_DIR,
  readLanzaPaths,
} from "../lib-imports.js";

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

export function obterMeta() {
  return {
    apiVersion: API_VERSION,
    repoRoot: REPO_ROOT,
    paths: readLanzaPaths(),
    database: {
      clientes: dbTimestamp("clientes.json"),
      veiculos: dbTimestamp("veiculos.json"),
      contratos: dbTimestamp("contratos.json"),
      clienteDespesas: dbTimestamp("cliente-despesas.json"),
      parceiroDespesas: dbTimestamp("parceiro-despesas.json"),
      infracoes: dbTimestamp("infracoes.json"),
      locacoes: dbTimestamp("locacoes.json"),
    },
    ultimosSyncs: ultimosRelatoriosSync(),
  };
}
