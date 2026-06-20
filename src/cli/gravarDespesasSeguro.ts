import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT } from "../lib/repoRoot.js";

const DBD = path.join(REPO_ROOT, "database", "despesas.json");
const DBV = path.join(REPO_ROOT, "database", "veiculos.json");

function norm(p: string): string {
  return String(p || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

type Boleto = {
  placa: string;
  valor: number | string;
  data?: string;
  competencia?: string;
  origem?: string;
};

export function main(argv: string[]): void {
  const boletosPath = path.resolve(argv[0]!);
  const boletos = JSON.parse(fs.readFileSync(boletosPath, "utf8")) as Boleto[];
  const desp = JSON.parse(fs.readFileSync(DBD, "utf8")) as {
    despesas: Record<string, unknown>[];
    atualizadoEm?: string;
  };
  const veic = JSON.parse(fs.readFileSync(DBV, "utf8")) as {
    veiculos: { id: string; placa: string }[];
  };

  const byPlaca = new Map(
    veic.veiculos.map((v) => [norm(v.placa), v] as const),
  );
  const existentes = desp.despesas;
  const porOrigem = new Map<string | undefined, Record<string, unknown>>();
  for (const d of existentes) {
    porOrigem.set(d.origem as string | undefined, d);
  }

  let novos = 0;
  let atualizados = 0;
  const semVeiculo: string[] = [];

  for (const b of boletos) {
    const v = byPlaca.get(norm(b.placa));
    if (!v) semVeiculo.push(b.placa);
    const registro: Record<string, unknown> = {
      veiculoId: v?.id ?? null,
      placa: v?.placa ?? b.placa,
      categoria: "Seguro",
      descricao: "Seguro",
      data: b.data,
      valor: Math.round(Number(b.valor) * 100) / 100,
      competencia: b.competencia,
      origem: b.origem,
    };
    const ex = porOrigem.get(b.origem);
    if (ex) {
      registro.id = ex.id as string;
      const idx = existentes.indexOf(ex);
      if (idx >= 0) existentes[idx] = registro;
      porOrigem.set(b.origem, registro);
      atualizados++;
    } else {
      registro.id = crypto.randomUUID();
      existentes.push(registro);
      porOrigem.set(b.origem, registro);
      novos++;
    }
  }

  desp.atualizadoEm = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(DBD, JSON.stringify(desp, null, 2), "utf8");

  const total = existentes
    .filter((d) => String(d.categoria).toLowerCase() === "seguro")
    .reduce((s, d) => s + Number(d.valor), 0);
  console.log(
    `Seguro: ${novos} novos, ${atualizados} atualizados. Total seguros na base: R$ ${total.toFixed(2)}`,
  );
  if (semVeiculo.length) {
    console.log("Placas sem veiculo cadastrado:", semVeiculo.join(", "));
  }
}
