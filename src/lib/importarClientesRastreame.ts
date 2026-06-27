import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { listMotoristas } from "./rastreame/motorista.js";
import {
  motoristaToCliente,
  normCpfKey,
  type ClienteImportado,
} from "./rastreame/mapMotoristaCliente.js";
import { REPO_ROOT } from "./repoRoot.js";

const DB = path.join(REPO_ROOT, "database", "clientes.json");

export type ImportarClientesResult = {
  totalRastreame: number;
  importados: number;
  atualizados: number;
  ignorados: { nome: string; motivo: string }[];
};

function loadDb(): { clientes: ClienteImportado[]; atualizadoEm?: string; descricao?: string; schemaCliente?: unknown } {
  if (!fs.existsSync(DB)) {
    return { clientes: [] };
  }
  return JSON.parse(fs.readFileSync(DB, "utf8")) as {
    clientes: ClienteImportado[];
    atualizadoEm?: string;
    descricao?: string;
    schemaCliente?: unknown;
  };
}

function mergeCliente(db: { clientes: ClienteImportado[] }, novo: ClienteImportado): "novo" | "atualizado" {
  const cpfKey = novo.cpf ? normCpfKey(String(novo.cpf)) : "";
  const cnhKey = String((novo.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "").replace(/\D/g, "");

  let idx = -1;
  if (cpfKey) {
    idx = db.clientes.findIndex((c) => c.cpf && normCpfKey(String(c.cpf)) === cpfKey);
  }
  if (idx < 0 && cnhKey) {
    idx = db.clientes.findIndex((c) => {
      const reg = (c.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "";
      return reg.replace(/\D/g, "") === cnhKey;
    });
  }

  if (idx >= 0) {
    const existente = db.clientes[idx]!;
    novo.id = existente.id;
    db.clientes[idx] = { ...existente, ...novo, id: existente.id };
    return "atualizado";
  }

  novo.id = crypto.randomUUID();
  db.clientes.push(novo);
  return "novo";
}

export async function importarClientesRastreame(opts?: {
  dryRun?: boolean;
}): Promise<ImportarClientesResult> {
  const motoristas = await listMotoristas();
  const result: ImportarClientesResult = {
    totalRastreame: motoristas.length,
    importados: 0,
    atualizados: 0,
    ignorados: [],
  };

  if (motoristas.length === 0) {
    return result;
  }

  const db = loadDb();

  for (const m of motoristas) {
    const cliente = motoristaToCliente(m);
    if (!cliente) {
      result.ignorados.push({
        nome: m.nome ?? "(sem nome)",
        motivo: "sem nome, CPF ou CNH",
      });
      continue;
    }

    if (!cliente.cpf && !String((cliente.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "").replace(/\D/g, "")) {
      result.ignorados.push({
        nome: m.nome ?? "(sem nome)",
        motivo: "sem CPF na observação e sem CNH",
      });
      continue;
    }

    if (opts?.dryRun) {
      console.log(`[dry-run] ${cliente.nome} | CPF ${cliente.cpf} | CNH ${(cliente.cnh as Record<string, string>).numeroRegistro ?? "?"}`);
      result.importados++;
      continue;
    }

    const acao = mergeCliente(db, cliente);
    if (acao === "novo") {
      result.importados++;
      console.log(`[OK novo] ${cliente.nome} (${cliente.cpf})`);
    } else {
      result.atualizados++;
      console.log(`[OK atualizado] ${cliente.nome} (${cliente.cpf})`);
    }
  }

  if (!opts?.dryRun && (result.importados > 0 || result.atualizados > 0)) {
    db.atualizadoEm = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DB, JSON.stringify(db, null, 2), "utf8");
  }

  return result;
}
