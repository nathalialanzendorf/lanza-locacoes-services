/**
 * CLI — baixa de recebimento (plano unitário ou lote PagBank).
 *
 *   baixa-recebimento plano --cliente Virginia --valor 650 --data 18/06/2026 [--hora 06:10] [--comprovante "..."] [--desconto] [--json]
 *   baixa-recebimento pagbank [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--json]
 *
 * Saída JSON para o agente montar tabela de confirmação (skill cadastro-recebimento).
 * Não grava — confirmação Sim/Não linha a linha continua obrigatória.
 */
import {
  formatPlanoTabela,
  montarPlanoBaixa,
  parseDataBr,
  parseHoraBr,
  parseValorInput,
} from "../lib/recebimento/baixaPlano.js";
import { montarLotePagBank } from "../lib/pagbank/matchLote.js";
import {
  defaultDateRange,
  fetchAllCreditosPagBank,
} from "../lib/pagbank/statements.js";

function parseArgs(argv: string[]): {
  cmd: string;
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
  return { cmd: rest[0] ?? "", flags };
}

function printHelp(): void {
  console.log(`Uso:
  baixa-recebimento plano --cliente <nome|cpf|id> --valor <R$> --data <DD/MM/AAAA|DD/MM> [--hora HH:MM] [--comprovante "texto"] [--desconto] [--json]
  baixa-recebimento pagbank [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--json]  (alias de pagbank match)

Modo plano: monta baixa de uma despesa em aberto + próxima parcela (pré-visualização).
Modo pagbank: alias de pagbank match — preferir: npx tsx src/run.ts pagbank match

Requer PAGBANK_AUTH (+ opcional PAGBANK_COOKIE) — ver .cursor/tools/pagbank/
Regras de negócio e confirmação: skill cadastro-recebimento`);
}

export async function main(argv: string[]): Promise<void> {
  const { cmd, flags } = parseArgs(argv);

  if (!cmd || cmd === "-h" || cmd === "--help" || flags.help) {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }

  const asJson = flags.json === true;

  if (cmd === "plano") {
    const cliente = String(flags.cliente ?? "");
    const valorRaw = String(flags.valor ?? "");
    const dataRaw = String(flags.data ?? "");
    if (!cliente || !valorRaw || !dataRaw) {
      console.error("Faltam --cliente, --valor e --data.");
      process.exit(2);
    }
    const plano = montarPlanoBaixa({
      clienteQuery: cliente,
      valor: parseValorInput(valorRaw),
      dataBr: parseDataBr(dataRaw),
      horaBr: flags.hora != null ? parseHoraBr(String(flags.hora)) : null,
      comprovante: flags.comprovante != null ? String(flags.comprovante) : null,
      desconto: flags.desconto === true,
    });

    if (asJson) {
      console.log(JSON.stringify(plano, null, 2));
    } else {
      console.log(`Cliente: ${plano.cliente.nome}`);
      console.log(`Tipo baixa: ${plano.tipoBaixa}`);
      if (plano.despesaAlvo) {
        console.log(
          `Despesa alvo: ${plano.despesaAlvo.autoInfracao} — ${plano.despesaAlvo.descricaoAtual} (R$ ${plano.despesaAlvo.valorDevido.toFixed(2)})`,
        );
      }
      for (const a of plano.avisos) console.log(`[aviso] ${a}`);
      if (plano.calculoSemanalAtraso?.exibir) {
        console.log(
          `\n=== Juros e multa semanal (total R$ ${plano.calculoSemanalAtraso.totalGeral.toFixed(2)}) ===\n`,
        );
        console.log(plano.calculoSemanalAtraso.markdown);
      }
      console.log("\n" + formatPlanoTabela(plano));
    }
    return;
  }

  if (cmd === "pagbank") {
    const def = defaultDateRange();
    const initialDate = String(flags.inicio ?? def.initialDate);
    const finalDate = String(flags.fim ?? def.finalDate);
    const creditos = await fetchAllCreditosPagBank({ initialDate, finalDate });
    const lote = montarLotePagBank(creditos, { initialDate, finalDate });

    if (asJson) {
      console.log(JSON.stringify(lote, null, 2));
    } else {
      console.log(`Intervalo: ${initialDate} → ${finalDate}`);
      console.log(`Créditos PagBank: ${lote.creditos} | planos: ${lote.planos.length} | sem match: ${lote.semMatch.length}`);
      for (const p of lote.planos) {
        console.log(
          `\n--- ${p.clienteQuery} | R$ ${p.pagbank.valor.toFixed(2)} | ${p.pagbank.dataBr} | confiança ${p.confianca} ---`,
        );
        console.log(`PagBank: ${p.pagbank.descricao.slice(0, 80)}`);
        console.log(formatPlanoTabela(p.plano));
      }
      if (lote.semMatch.length > 0) {
        console.log("\n=== Sem match automático ===");
        for (const s of lote.semMatch) {
          console.log(
            `- R$ ${s.valor.toFixed(2)} | ${s.dataBr} | ${s.descricao.slice(0, 100)}`,
          );
        }
      }
    }
    return;
  }

  console.error("Comando desconhecido:", cmd);
  printHelp();
  process.exit(2);
}
