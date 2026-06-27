/**
 * CLI — Gastos Gerais no Rastreame (POST/PUT/list).
 */
import fs from "node:fs";
import path from "node:path";

import {
  fetchGastosList,
  postGasto,
  putGasto,
} from "../lib/rastreame/gasto.js";

function parseArgs(argv: string[]): {
  flags: Record<string, string>;
  rest: string[];
} {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--page" && argv[i + 1]) {
      flags.page = argv[++i]!;
    } else if (a === "--size" && argv[i + 1]) {
      flags.size = argv[++i]!;
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

export async function main(argv: string[]): Promise<void> {
  if (argv.length < 1) {
    console.error(`Uso:
  rastreame-gastos list [--page 0] [--size 50]
  rastreame-gastos post <corpo.json>
  rastreame-gastos put <id> <corpo.json>

Regras de negócio (ATRASADO, duplicados, etc.): skill cadastro-recebimento.`);
    process.exit(2);
  }
  const cmd = argv[0]!;
  const { flags, rest } = parseArgs(argv.slice(1));

  if (cmd === "list") {
    const page = flags.page !== undefined ? Number(flags.page) : 0;
    const size = flags.size !== undefined ? Number(flags.size) : 50;
    const r = await fetchGastosList({ page, size });
    const text = await r.text();
    if (!r.ok) {
      console.error(`ERRO HTTP ${r.status}:`, text.slice(0, 500));
      console.error(
        ">> Se 404, confirme no DevTools (Network) o URL exato da listagem de gastos e ajuste src/lib/rastreame/gasto.ts.",
      );
      process.exit(1);
    }
    try {
      const j = JSON.parse(text) as unknown;
      console.log(JSON.stringify(j, null, 2));
    } catch {
      console.log(text);
    }
    return;
  }

  if (cmd === "post") {
    const file = rest[0];
    if (!file) {
      console.error("Falta <corpo.json>");
      process.exit(2);
    }
    const body = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    const r = await postGasto(body);
    const text = await r.text();
    if (!r.ok) {
      console.error(`ERRO HTTP ${r.status}:`, text.slice(0, 500));
      process.exit(1);
    }
    console.log(text);
    return;
  }

  if (cmd === "put") {
    const id = rest[0];
    const file = rest[1];
    if (!id || !file) {
      console.error("Uso: rastreame-gastos put <id> <corpo.json>");
      process.exit(2);
    }
    const body = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    const r = await putGasto(id, body);
    const text = await r.text();
    if (!r.ok) {
      console.error(`ERRO HTTP ${r.status}:`, text.slice(0, 500));
      process.exit(1);
    }
    console.log(text);
    return;
  }

  console.error("Comando desconhecido:", cmd);
  process.exit(2);
}
