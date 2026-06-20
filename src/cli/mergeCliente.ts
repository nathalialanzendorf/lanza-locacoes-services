import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "../lib/repoRoot.js";

const DB = path.join(REPO_ROOT, "database", "clientes.json");

type Cliente = Record<string, unknown> & { id?: string; nome?: string; cpf?: string };

export function main(argv: string[]): void {
  const p = path.resolve(argv[0]!);
  const novo = JSON.parse(fs.readFileSync(p, "utf8")) as Cliente;
  const db = JSON.parse(fs.readFileSync(DB, "utf8")) as {
    clientes: Cliente[];
    atualizadoEm?: string;
  };
  const existente = db.clientes.find((c) => c.cpf === novo.cpf);
  let acao: string;
  if (existente) {
    novo.id = existente.id;
    db.clientes = db.clientes.map((c) => (c === existente ? novo : c));
    acao = "atualizado";
  } else {
    novo.id = crypto.randomUUID();
    db.clientes.push(novo);
    acao = "cadastrado";
  }
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(DB, JSON.stringify(db, null, 2), "utf8");
  console.log(`Cliente ${acao}: ${novo.nome} (id ${novo.id})`);
}
