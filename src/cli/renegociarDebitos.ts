/**
 * Renegociação de débitos — Rastreame Gastos Gerais.
 *
 *   npx tsx src/run.ts renegociar-debitos resumo --motorista 28 --rastreavel 110
 *   npx tsx src/run.ts renegociar-debitos relatorios/_renegociacao.json
 *   npx tsx src/run.ts renegociar-debitos relatorios/_renegociacao.json --execute
 */
import fs from "node:fs";
import path from "node:path";

import {
  executarRenegociacao,
  listarDebitosAbertos,
  somarDebitos,
  validarParcelas,
  type RenegociacaoInput,
} from "../lib/rastreame/renegociacao.js";
import { fetchGastoById } from "../lib/rastreame/gasto.js";

function parseArgs(argv: string[]): {
  sub: string;
  flags: Record<string, string>;
  rest: string[];
  execute: boolean;
} {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  let execute = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--execute") execute = true;
    else if (a === "--motorista" && argv[i + 1]) flags.motorista = argv[++i]!;
    else if (a === "--rastreavel" && argv[i + 1]) flags.rastreavel = argv[++i]!;
    else rest.push(a);
  }
  const sub = rest[0] ?? "";
  return { sub, flags, rest: rest.slice(1), execute };
}

async function cmdResumo(motoristaKey: string, rastreavelKey: string): Promise<void> {
  const debitos = await listarDebitosAbertos(motoristaKey, rastreavelKey);
  console.log(`Débitos em aberto (motorista ${motoristaKey}, rastreável ${rastreavelKey}): ${debitos.length}`);
  console.log("");
  for (const d of debitos) {
    console.log(
      `  id ${d.id} | R$ ${d.total.toFixed(2)} | ${d.tipo ?? "?"} | ${d.info}`,
    );
  }
  console.log("");
  console.log(`Total: R$ ${somarDebitos(debitos).toFixed(2)}`);
  console.log("");
  console.log("IDs para JSON:", JSON.stringify(debitos.map((d) => d.id)));
}

async function cmdRenegociar(jsonPath: string, execute: boolean): Promise<void> {
  const input = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as RenegociacaoInput;

  if (!input.negociacaoCodigo || !input.gastosIds?.length || !input.parcelas?.length) {
    throw new Error("JSON requer negociacaoCodigo, gastosIds[] e parcelas[]");
  }
  if (!input.motoristaKey || !input.rastreavelKey) {
    throw new Error("JSON requer motoristaKey e rastreavelKey");
  }

  let totalDebitos = 0;
  console.log("=== Débitos selecionados ===");
  for (const id of input.gastosIds) {
    const g = await fetchGastoById(id);
    const total = Number(g.total ?? 0);
    totalDebitos += total;
    console.log(`  id ${id} | R$ ${total.toFixed(2)} | ${String(g.info ?? "")}`);
  }
  totalDebitos = Math.round(totalDebitos * 100) / 100;
  console.log(`  Subtotal débitos: R$ ${totalDebitos.toFixed(2)}`);
  console.log("");

  const val = validarParcelas(totalDebitos, input.parcelas);
  console.log("=== Parcelas da renegociação ===");
  for (const p of input.parcelas) {
    console.log(
      `  ${p.numero}x${p.totalParcelas} | R$ ${p.valor.toFixed(2)} | ${p.data}`,
    );
  }
  console.log(`  Soma parcelas: R$ ${val.soma.toFixed(2)}`);
  if (!val.ok) {
    console.log(
      `  [AVISO] Soma parcelas difere dos débitos em R$ ${val.diff.toFixed(2)} — confirmar com operador.`,
    );
  }
  console.log("");

  console.log(execute ? "MODO: EXECUTAR" : "MODO: dry-run (use --execute)");
  const r = await executarRenegociacao(input, { execute });

  console.log("=== Marcação [NEGOCIADO] ===");
  for (const m of r.marcados) {
    console.log(`  PUT ${m.id}: "${m.infoAntes}" → "${m.infoDepois}"`);
  }
  console.log("");
  console.log("=== Novas parcelas (DOCUMENTACAO) ===");
  for (const p of r.parcelasCriadas) {
    console.log(`  POST | ${p.info} | R$ ${p.valor.toFixed(2)} | ${p.data}`);
  }
  if (r.avisos.length) {
    console.log("");
    console.log("Avisos:");
    for (const a of r.avisos) console.log(`  • ${a}`);
  }
}

export async function main(argv: string[]): Promise<void> {
  const { sub, flags, rest, execute } = parseArgs(argv);

  if (sub === "resumo") {
    const mk = flags.motorista;
    const rk = flags.rastreavel;
    if (!mk || !rk) {
      console.error("Uso: renegociar-debitos resumo --motorista <key> --rastreavel <key>");
      process.exit(2);
    }
    await cmdResumo(mk, rk);
    return;
  }

  const jsonPath = rest[0] ?? sub;
  if (!jsonPath || jsonPath === "resumo") {
    console.error(`Uso:
  renegociar-debitos resumo --motorista <key> --rastreavel <key>
  renegociar-debitos <entrada.json> [--execute]`);
    process.exit(2);
  }

  await cmdRenegociar(path.resolve(jsonPath), execute);
}
