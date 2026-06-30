/**
 * CLI — PagBank (extrato de créditos + cruzamento com despesas de cliente).
 *
 *   pagbank check
 *   pagbank creditos list [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--page N] [--json]
 *   pagbank match [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--json]
 */
import { checkPagBankAuth, pagBankAuthConfigured } from "../lib/pagbank/auth.js";
import { montarLotePagBank } from "../lib/pagbank/matchLote.js";
import {
  defaultDateRange,
  fetchAllCreditosPagBank,
  fetchCreditosPagBank,
} from "../lib/pagbank/statements.js";

function parseArgs(argv: string[]): {
  cmd: string;
  sub: string;
  flags: Record<string, string | boolean>;
} {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { cmd: rest[0] ?? "", sub: rest[1] ?? "", flags };
}

function printHelp(): void {
  console.log(`Uso:
  pagbank check
  pagbank creditos list [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--page N] [--json]
  pagbank match [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--json]

Auth: PAGBANK_AUTH (+ opcional PAGBANK_COOKIE) — ver .cursor/tools/pagbank/
Regras de baixa e confirmação: skill cadastro-recebimento`);
}

export async function main(argv: string[]): Promise<void> {
  const { cmd, sub, flags } = parseArgs(argv);

  if (!cmd || cmd === "-h" || cmd === "--help" || flags.help) {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === "check") {
    if (!pagBankAuthConfigured()) {
      console.error("PAGBANK_AUTH não definido.");
      process.exit(2);
    }
    const r = await checkPagBankAuth();
    console.log("OK: sessão PagBank válida.");
    console.log(`Resposta extrato (amostra): ${r.creditos} campo(s) no JSON bruto.`);
    return;
  }

  if (cmd === "creditos" && sub === "list") {
    const def = defaultDateRange();
    const initialDate = String(flags.inicio ?? def.initialDate);
    const finalDate = String(flags.fim ?? def.finalDate);
    const asJson = flags.json === true;

    if (flags.page != null) {
      const page = Number(flags.page);
      const { creditos, raw } = await fetchCreditosPagBank({
        initialDate,
        finalDate,
        page,
      });
      if (asJson) {
        console.log(JSON.stringify({ initialDate, finalDate, page, creditos, raw }, null, 2));
      } else {
        console.log(`Créditos PagBank (${initialDate} → ${finalDate}, pág. ${page}): ${creditos.length}`);
        for (const c of creditos) {
          console.log(
            `- R$ ${c.valor.toFixed(2)} | ${c.dataBr}${c.horaBr ? ` ${c.horaBr}` : ""} | ${c.nomePagador ?? "?"} | ${c.descricao.slice(0, 80)}`,
          );
        }
      }
      return;
    }

    const creditos = await fetchAllCreditosPagBank({ initialDate, finalDate });
    if (asJson) {
      console.log(JSON.stringify({ initialDate, finalDate, creditos }, null, 2));
    } else {
      console.log(`Créditos PagBank (${initialDate} → ${finalDate}): ${creditos.length}`);
      for (const c of creditos) {
        console.log(
          `- R$ ${c.valor.toFixed(2)} | ${c.dataBr}${c.horaBr ? ` ${c.horaBr}` : ""} | ${c.nomePagador ?? "?"} | ${c.descricao.slice(0, 80)}`,
        );
      }
    }
    return;
  }

  if (cmd === "match") {
    const def = defaultDateRange();
    const initialDate = String(flags.inicio ?? def.initialDate);
    const finalDate = String(flags.fim ?? def.finalDate);
    const creditos = await fetchAllCreditosPagBank({ initialDate, finalDate });
    const lote = montarLotePagBank(creditos, { initialDate, finalDate });

    if (flags.json === true) {
      console.log(JSON.stringify(lote, null, 2));
    } else {
      console.log(`Intervalo: ${initialDate} → ${finalDate}`);
      console.log(
        `Créditos: ${lote.creditos} | planos: ${lote.planos.length} | sem match: ${lote.semMatch.length}`,
      );
      for (const p of lote.planos) {
        console.log(
          `\n--- ${p.clienteQuery} | R$ ${p.pagbank.valor.toFixed(2)} | ${p.pagbank.dataBr} | ${p.confianca}${p.jaBaixado ? " | JÁ BAIXADO?" : ""}${p.revisaoManual ? " | REVISÃO MANUAL" : ""} ---`,
        );
        console.log(`  ${p.motivo}`);
        console.log(`  PagBank: ${p.pagbank.descricao.slice(0, 100)}`);
        for (const l of p.plano.linhas) {
          console.log(
            `  #${l.num} ${l.operacao} | ${l.descricao} | R$ ${l.total.toFixed(2)} | ${l.data}`,
          );
        }
      }
      if (lote.semMatch.length > 0) {
        console.log("\n=== Sem match ===");
        for (const s of lote.semMatch) {
          console.log(`- R$ ${s.valor.toFixed(2)} | ${s.dataBr} | ${s.descricao.slice(0, 100)}`);
        }
      }
    }
    return;
  }

  console.error("Comando desconhecido:", cmd, sub);
  printHelp();
  process.exit(2);
}
