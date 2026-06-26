import fs from "node:fs";
import path from "node:path";

import {
  loadParceiroDespesasDb,
  sincronizarParceiroDespesa,
} from "../lib/parceiroDespesasDb.js";

type Boleto = {
  placa: string;
  valor: number | string;
  data?: string;
  competencia?: string;
  origem?: string;
};

export function main(argv: string[]): void {
  const boletosPath = path.resolve(argv[0]!);
  if (!fs.existsSync(boletosPath)) {
    console.error(`Uso: sync-seguro <boletos.json>`);
    console.error(`Ficheiro não encontrado: ${boletosPath}`);
    process.exit(1);
  }

  const boletos = JSON.parse(fs.readFileSync(boletosPath, "utf8")) as Boleto[];
  let novos = 0;
  let atualizados = 0;
  const semVeiculo: string[] = [];

  for (const b of boletos) {
    const r = sincronizarParceiroDespesa({
      placa: b.placa,
      categoria: "Seguro",
      descricao: "Seguro",
      data: b.data ?? "",
      valor: b.valor,
      competencia: b.competencia,
      origem: b.origem,
    });
    if (r.aviso?.includes("placa")) semVeiculo.push(b.placa);
    if (r.acao === "novo") novos++;
    else if (r.acao === "atualizado") atualizados++;
  }

  const db = loadParceiroDespesasDb();
  const total = db.parceiroDespesas
    .filter((d) => String(d.categoria).toLowerCase() === "seguro")
    .reduce((s, d) => s + Number(d.valor), 0);
  console.log(
    `Seguro: ${novos} novos, ${atualizados} atualizados. Total seguros na base: R$ ${total.toFixed(2)}`,
  );
  if (semVeiculo.length) {
    console.log("Placas sem veiculo cadastrado:", [...new Set(semVeiculo)].join(", "));
  }
}
