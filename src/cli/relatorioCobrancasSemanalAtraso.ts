/**
 * CLI: tabela de cobrança semanal com juros e multa (pagamento não realizado).
 */
import fs from "node:fs";
import path from "node:path";

import { loadClienteDespesasDb } from "../lib/clienteDespesasDb.js";
import { loadContratosDb } from "../lib/contratosDb.js";
import { dataVencimentoSemanalBr } from "../lib/pagamentoSemanal.js";
import {
  calcularCobrancaSemanalAtraso,
  formatCobrancaSemanalAtrasoMarkdown,
  jurosMultaDiario,
} from "../lib/pagamentoSemanalCobranca.js";
import { parseDataBr, resolverCliente } from "../lib/recebimento/baixaPlano.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

function getOpt(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

function uso(): void {
  console.log(`Uso: relatorio-cobrancas semanal-atraso [opções]

Calcula tabelas dia a dia (Situação | Juros e multa | Total/dia) para parcelas
semanais não pagas. Padrão Lanza — ver skill relatorio-cobrancas.

Opções:
  --cliente NOME/CPF/id   Cliente (obrigatório se não usar --placa com contrato)
  --placa PLACA           Placa — infere contrato e despesas ATRASADO em aberto
  --data-pagamento DD/MM/AAAA   Data do pagamento integral [padrão: hoje]
  --vencimento DD/MM/AAAA       Vencimento(s) manual(is); repetir a flag
  --vencimentos D1,D2           Lista separada por vírgula
  --valor-semanal N       Override valor semanal (R$)
  --valor-diaria N        Override diária de atraso (R$)
  --json                  Saída JSON estruturada
  --no-salvar             Não gravar .md em relatorios/cobrancas/
  --out DIR               Diretório de saída

Exemplos:
  relatorio-cobrancas semanal-atraso --cliente "Daniel Damasceno" --data-pagamento 30/06/2026
  relatorio-cobrancas semanal-atraso --placa RAH-4F54 --vencimento 20/06/2026 --vencimento 27/06/2026
`);
}

function parseVencimentos(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--vencimento" && argv[i + 1]) {
      out.push(parseDataBr(argv[i + 1]!));
      i++;
    }
  }
  const csv = getOpt(argv, "--vencimentos");
  if (csv) {
    for (const v of csv.split(/[,;]/)) {
      const t = v.trim();
      if (t) out.push(parseDataBr(t));
    }
  }
  return out.sort((a, b) => {
    const pa = a.split("/").reverse().join("");
    const pb = b.split("/").reverse().join("");
    return pa.localeCompare(pb);
  });
}

function normPlaca(p: string): string {
  return p.replace(/\W/g, "").toUpperCase();
}

function contratoAtivoPlaca(placa: string) {
  const p = normPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) => c.status === "ativo" && normPlaca(c.placa ?? "") === p,
  );
  list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return list[0] ?? null;
}

function vencimentosAbertosCliente(clienteId: string, placa?: string): string[] {
  const db = loadClienteDespesasDb();
  const vencs = db.clienteDespesas
    .filter(
      (d) =>
        d.condutorId === clienteId &&
        d.ativo !== false &&
        d.paga !== true &&
        d.categoria === "Locação semanal" &&
        /ATRASADO/i.test(d.descricao) &&
        (!placa || normPlaca(d.veiculoId) === normPlaca(placa)),
    )
    .map((d) => dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao)
    .filter(Boolean) as string[];

  return [...new Set(vencs)].sort((a, b) => {
    const pa = a.split("/").reverse().join("");
    const pb = b.split("/").reverse().join("");
    return pa.localeCompare(pb);
  });
}

function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

export function mainSemanalAtraso(argv: string[]): void {
  if (argv.includes("-h") || argv.includes("--help")) {
    uso();
    process.exit(0);
  }

  const clienteQuery = getOpt(argv, "--cliente");
  const placa = getOpt(argv, "--placa");
  const dataPagamentoBr = parseDataBr(getOpt(argv, "--data-pagamento") ?? hojeBr());
  const salvar = !argv.includes("--no-salvar");
  const outDir = getOpt(argv, "--out") ?? path.join(REPO_ROOT, "relatorios", "cobrancas");
  const asJson = argv.includes("--json");

  let cliente = clienteQuery ? resolverCliente(clienteQuery) : null;
  let valorSemanal = getOpt(argv, "--valor-semanal")
    ? Number(getOpt(argv, "--valor-semanal")!.replace(",", "."))
    : null;
  let valorDiaria = getOpt(argv, "--valor-diaria")
    ? Number(getOpt(argv, "--valor-diaria")!.replace(",", "."))
    : null;

  if (placa) {
    const c = contratoAtivoPlaca(placa);
    if (c) {
      if (!cliente) {
        cliente = resolverCliente(c.clienteNome ?? c.clienteId ?? "");
      }
      valorSemanal ??= c.valorSemanal ?? null;
      valorDiaria ??= c.valorDiaria ?? null;
    }
  }

  if (!cliente) {
    console.error("Erro: informe --cliente ou --placa com contrato ativo.");
    uso();
    process.exit(1);
  }

  let vencimentos = parseVencimentos(argv);
  if (vencimentos.length === 0) {
    vencimentos = vencimentosAbertosCliente(cliente.id!, placa ?? undefined);
  }
  if (vencimentos.length === 0) {
    console.error(
      "Nenhum vencimento em aberto encontrado. Use --vencimento DD/MM/AAAA ou confira despesas ATRASADO.",
    );
    process.exit(1);
  }

  if (valorSemanal == null || valorDiaria == null) {
    console.error("Erro: valor semanal/diária não encontrado — use --valor-semanal e --valor-diaria.");
    process.exit(1);
  }

  const input = {
    valorSemanal,
    valorDiaria,
    vencimentosBr: vencimentos,
    dataPagamentoBr,
  };

  const resultado = calcularCobrancaSemanalAtraso(input);

  const payload = {
    ...input,
    cliente: { id: cliente.id, nome: cliente.nome, cpf: cliente.cpf },
    placa: placa ?? null,
    jurosMultaDiario: jurosMultaDiario(valorSemanal, valorDiaria),
    ...resultado,
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      formatCobrancaSemanalAtrasoMarkdown(
        { ...input, clienteNome: cliente.nome, placa: placa ?? undefined },
        resultado,
      ),
    );
  }

  if (salvar) {
    fs.mkdirSync(outDir, { recursive: true });
    const slug = (cliente.nome ?? "cliente")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w]+/g, "-")
      .toLowerCase()
      .slice(0, 40);
    const dataArq = dataPagamentoBr.replace(/\//g, "-");
    const mdPath = path.join(outDir, `semanal-atraso-${slug}-${dataArq}.md`);
    const jsonPath = path.join(outDir, `dados-semanal-atraso-${slug}-${dataArq}.json`);
    fs.writeFileSync(
      mdPath,
      formatCobrancaSemanalAtrasoMarkdown(
        { ...input, clienteNome: cliente.nome, placa: placa ?? undefined },
        resultado,
      ),
      "utf8",
    );
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
    if (!asJson) {
      console.log(`\n[arquivos gerados]\n  ${mdPath}\n  ${jsonPath}`);
    }
  }
}
