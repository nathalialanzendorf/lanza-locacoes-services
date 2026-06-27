import fs from "node:fs";
import path from "node:path";

import {
  defaultSeguroComprovantesDirs,
  extrairSeguroComprovantesDirs,
  type SeguroBoletoExtraido,
} from "../lib/extrairSeguroComprovante.js";
import {
  loadParceiroDespesasDb,
  sincronizarParceiroDespesa,
} from "../lib/parceiroDespesasDb.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

type Boleto = SeguroBoletoExtraido;

function syncBoletos(boletos: Boleto[]): {
  novos: number;
  atualizados: number;
  semAlteracao: number;
  semVeiculo: string[];
} {
  let novos = 0;
  let atualizados = 0;
  let semAlteracao = 0;
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
    else if (r.acao === "sem_alteracao") semAlteracao++;
  }

  return { novos, atualizados, semAlteracao, semVeiculo };
}

function printResumo(
  label: string,
  stats: ReturnType<typeof syncBoletos>,
  totalBoletos: number,
): void {
  const db = loadParceiroDespesasDb();
  const total = db.parceiroDespesas
    .filter((d) => String(d.categoria).toLowerCase() === "seguro")
    .reduce((s, d) => s + Number(d.valor), 0);
  console.log(
    `${label}: ${totalBoletos} boletos processados — ${stats.novos} novos, ${stats.atualizados} atualizados, ${stats.semAlteracao} sem alteração.`,
  );
  console.log(`Total seguros na base: R$ ${total.toFixed(2)}`);
  if (stats.semVeiculo.length) {
    console.log(
      "Placas sem veiculo cadastrado:",
      [...new Set(stats.semVeiculo)].join(", "),
    );
  }
}

export async function main(argv: string[]): Promise<void> {
  let scanDirs: string[] = [];
  let anos: string[] = [];
  let outJson: string | null = null;
  let jsonOnly = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--scan" && argv[i + 1]) {
      scanDirs.push(path.resolve(argv[++i]!));
    } else if (a === "--ano" && argv[i + 1]) {
      anos.push(argv[++i]!);
    } else if (a === "--out" && argv[i + 1]) {
      outJson = path.resolve(argv[++i]!);
    } else if (a === "--json-only") {
      jsonOnly = true;
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }

  if (scanDirs.length || anos.length) {
    if (!scanDirs.length && anos.length) {
      scanDirs = defaultSeguroComprovantesDirs(anos);
    }
    const { boletos, erros } = await extrairSeguroComprovantesDirs(scanDirs);
    const outPath =
      outJson ||
      path.join(REPO_ROOT, "relatorios", "_tmp", "_boletos_seguro_scan.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(boletos, null, 2), "utf8");
    console.log(`Extraídos ${boletos.length} boletos de ${scanDirs.length} pasta(s).`);
    console.log(`JSON: ${outPath}`);
    if (erros.length) {
      console.log(`Avisos (${erros.length}):`);
      for (const e of erros.slice(0, 20)) console.log(`  - ${e}`);
      if (erros.length > 20) console.log(`  ... +${erros.length - 20} mais`);
    }
    if (jsonOnly) return;
    const stats = syncBoletos(boletos);
    printResumo("Seguro", stats, boletos.length);
    return;
  }

  const boletosPath = path.resolve(positional[0] ?? "");
  if (!fs.existsSync(boletosPath)) {
    console.error(`Uso: sync-seguro <boletos.json>`);
    console.error(`     sync-seguro --ano 2025 --ano 2026 [--out relatorios/_tmp/x.json]`);
    console.error(`     sync-seguro --scan <pasta> [--scan <pasta>]`);
    console.error(`Ficheiro não encontrado: ${boletosPath}`);
    process.exit(1);
  }

  const boletos = JSON.parse(fs.readFileSync(boletosPath, "utf8")) as Boleto[];
  const stats = syncBoletos(boletos);
  printResumo("Seguro", stats, boletos.length);
}
