import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "../lib/repoRoot.js";

const DBD = path.join(REPO_ROOT, "database", "despesas.json");
const DBV = path.join(REPO_ROOT, "database", "veiculos.json");

function norm(p: string): string {
  return String(p || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function main(argv: string[]): void {
  const categoria = argv[0]!;
  const valorRaw = argv[1]!;
  const data = argv[2]!;
  const placa = argv[3]!;
  const descricao = argv[4] ?? categoria;

  const valor =
    valorRaw.includes(",")
      ? parseFloat(valorRaw.replace(/\./g, "").replace(",", "."))
      : parseFloat(valorRaw);

  let comp = "";
  const m1 = data.match(/(\d{2})\/(\d{4})$/);
  if (m1) {
    comp = `${m1[1]}/${m1[2]}`;
  } else {
    const m2 = data.match(/^\d{2}\/(\d{2})\/(\d{4})/);
    if (m2) {
      comp = `${m2[1]}/${m2[2]}`;
    }
  }

  const desp = JSON.parse(fs.readFileSync(DBD, "utf8")) as {
    despesas: Record<string, unknown>[];
    atualizadoEm?: string;
  };
  const veic = JSON.parse(fs.readFileSync(DBV, "utf8")) as {
    veiculos: { id: string; placa: string }[];
  };
  const v = veic.veiculos.find((x) => norm(x.placa) === norm(placa));

  const reg = {
    id: crypto.randomUUID(),
    veiculoId: v?.id ?? null,
    placa: v?.placa ?? placa,
    categoria,
    descricao,
    data,
    valor: Math.round(valor * 100) / 100,
    competencia: comp,
    origem: "manual",
  };
  desp.despesas.push(reg);
  desp.atualizadoEm = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(DBD, JSON.stringify(desp, null, 2), "utf8");
  const aviso = v ? "" : "  (placa nao cadastrada: veiculoId=null)";
  console.log(
    `Despesa gravada: ${categoria} R$ ${reg.valor.toFixed(2)} em ${data} -> ${reg.placa}${aviso}`,
  );
}
