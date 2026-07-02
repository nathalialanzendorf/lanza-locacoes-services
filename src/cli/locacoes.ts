import fs from "node:fs";
import path from "node:path";

import {
  excluirLocacao,
  gravarLocacao,
  listarLocacoes,
  sugerirLocacoes,
  type LocacaoInput,
  type SituacaoLocacao,
  type SugestaoVeiculo,
  type TipoLocacao,
} from "../lib/locacoesDb.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

const HELP = `locacoes | movimentacao — skill cadastro-movimentacao (database/locacoes.json)

locacoes <add|listar|excluir|sugerir> [opções]

  Movimentação: locado (cliente com veículo), manutencao (sem veículo), reserva (substituto).

  add       Cadastra/atualiza um período de uso de um veículo.
            --placa PLACA              (obrigatório)
            --situacao reserva|manutencao|locado   (obrigatório)
            --inicio DD/MM/AAAA        (obrigatório)
            --fim DD/MM/AAAA           (vazio = em aberto/vigente)
            --condutor "Nome|CPF|id"   (cliente; opcional p/ reserva/manutenção)
            --contrato <uuid>          (vincula a contratos.json)
            --tipo diaria|semanal|mensal   (obrigatório quando situacao=locado)
            --cobrado N                (valor por unidade cobrado do cliente)
            --pago N                   (valor por unidade repassado ao parceiro)
            --substitui PLACA          (veículo que esta reserva substitui)
            --obs "texto"
            --id <uuid>                (atualiza registro existente)

  listar    [--placa PLACA] [--situacao S] [--abertas]
  excluir   --id <uuid>

  sugerir   Agrega a tabela num período p/ SUGERIR à prestação de contas.
            --competencia MM/AAAA      (obrigatório)
            --inicio DD/MM/AAAA        (padrão: 1º dia da competência)
            --fim DD/MM/AAAA           (padrão: último dia da competência)
            --placa PLACA              (limita a um veículo)
            --json                     (imprime o objeto bruto)

Exemplos:
  locacoes add --placa MLN-0B87 --situacao locado --inicio 01/06/2026 \\
    --tipo semanal --cobrado 500 --pago 350 --condutor "Fulano de Tal"
  locacoes add --placa ABC-1D23 --situacao manutencao --inicio 05/06/2026 --fim 12/06/2026 --obs "Troca de motor"
  locacoes add --placa XYZ-9A88 --situacao reserva --inicio 05/06/2026 --tipo diaria --pago 71.42 --substitui ABC-1D23
  locacoes listar --placa MLN-0B87
  locacoes sugerir --competencia 06/2026
  locacoes excluir --id <uuid>`;

function opt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function add(argv: string[]): void {
  const input: LocacaoInput = {
    id: opt(argv, "--id"),
    placa: opt(argv, "--placa") ?? "",
    situacao: (opt(argv, "--situacao") ?? "") as SituacaoLocacao,
    inicio: opt(argv, "--inicio") ?? "",
    fim: opt(argv, "--fim") ?? null,
    condutor: opt(argv, "--condutor") ?? null,
    contratoId: opt(argv, "--contrato") ?? null,
    tipoLocacao: (opt(argv, "--tipo") ?? null) as TipoLocacao | null,
    valorCobrado: opt(argv, "--cobrado") ?? null,
    valorPago: opt(argv, "--pago") ?? null,
    substituiPlaca: opt(argv, "--substitui") ?? null,
    observacao: opt(argv, "--obs") ?? null,
  };

  const r = gravarLocacao(input);
  const l = r.registro;
  const periodo = `${l.inicio}${l.fim ? ` a ${l.fim}` : " (em aberto)"}`;
  const valores =
    l.situacao !== "manutencao"
      ? ` | ${l.tipoLocacao ?? "?"} cobrado R$ ${fmt(l.valorCobrado)} / pago R$ ${fmt(l.valorPago)}`
      : "";
  const sub = l.substituiPlaca ? ` | substitui ${l.substituiPlaca}` : "";
  const cond = l.condutorNome ? ` | ${l.condutorNome}` : "";
  console.log(
    `Locação ${r.acao}: ${l.placa} [${l.situacao}] ${periodo}${valores}${cond}${sub}`,
  );
  console.log(`  id: ${l.id}`);
  if (r.aviso) console.log(`  ⚠️ ${r.aviso}`);
}

function listar(argv: string[]): void {
  const placa = opt(argv, "--placa");
  const situacao = opt(argv, "--situacao") as SituacaoLocacao | undefined;
  const abertas = argv.includes("--abertas");
  const rows = listarLocacoes({ placa, situacao, abertas });
  if (!rows.length) {
    console.log("Nenhuma locação encontrada para o filtro.");
    return;
  }
  for (const l of rows) {
    const periodo = `${l.inicio}${l.fim ? `–${l.fim}` : "–(aberto)"}`;
    const valores =
      l.situacao !== "manutencao"
        ? ` ${l.tipoLocacao ?? "?"} R$ ${fmt(l.valorCobrado)}/R$ ${fmt(l.valorPago)}`
        : "";
    const cond = l.condutorNome ? ` ${l.condutorNome}` : "";
    const sub = l.substituiPlaca ? ` (subst. ${l.substituiPlaca})` : "";
    console.log(
      `${l.placa.padEnd(8)} ${l.situacao.padEnd(10)} ${periodo}${valores}${cond}${sub}  [${l.id}]`,
    );
  }
  console.log(`\nTotal: ${rows.length}`);
}

function excluir(argv: string[]): void {
  const id = opt(argv, "--id");
  if (!id) {
    console.error("Uso: locacoes excluir --id <uuid>");
    process.exit(1);
  }
  const removido = excluirLocacao(id);
  if (!removido) {
    console.log(`Nenhuma locação com id ${id}.`);
    return;
  }
  console.log(`Locação excluída: ${removido.placa} [${removido.situacao}] ${removido.inicio}`);
}

/** Mapa veiculoId -> nome do parceiro (igual ao montar-relatorio). */
function donoPorVeiculo(): Map<string, string> {
  const DB = path.join(REPO_ROOT, "database");
  const read = (n: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(DB, n), "utf8"));
  const parceiros = new Map(
    (read("parceiros.json") as { parceiros: { id: string; nome: string }[] }).parceiros.map(
      (p) => [p.id, p.nome] as const,
    ),
  );
  const out = new Map<string, string>();
  const vinc = (
    read("parceiro-veiculo.json") as {
      vinculos: { veiculoId: string; parceiroId: string }[];
    }
  ).vinculos;
  for (const v of vinc) {
    const nome = parceiros.get(v.parceiroId);
    if (nome) out.set(v.veiculoId, nome);
  }
  return out;
}

function sugerir(argv: string[]): void {
  const competencia = opt(argv, "--competencia") ?? opt(argv, "--comp");
  if (!competencia) {
    console.error("Uso: locacoes sugerir --competencia MM/AAAA [--inicio] [--fim] [--placa] [--json]");
    process.exit(1);
  }
  const s = sugerirLocacoes({
    competencia,
    inicio: opt(argv, "--inicio"),
    fim: opt(argv, "--fim"),
    placa: opt(argv, "--placa"),
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  const donos = donoPorVeiculo();
  const parceiroDe = (v: SugestaoVeiculo): string =>
    (v.veiculoId && donos.get(v.veiculoId)) || "?";

  console.log(`Sugestão de prestação — competência ${s.competencia}`);
  console.log(`Período: ${s.periodo.inicio} a ${s.periodo.fim}\n`);
  if (!s.veiculos.length) {
    console.log("Nenhum período de locação/reserva/manutenção no intervalo.");
    return;
  }

  for (const v of s.veiculos) {
    console.log(`🚗 ${v.placa} (${parceiroDe(v)})`);

    const ganho = v.ganhoItens.reduce((acc, i) => acc + i.valor, 0);
    if (v.ganhoItens.length) {
      console.log(`  💵 Ganho (valorPago): R$ ${fmt(ganho)}`);
      for (const it of v.ganhoItens) console.log(`     • ${it.descricao}`);
    }

    if (v.manutencaoItens.length) {
      const totManut = v.manutencaoItens.reduce((acc, i) => acc + i.valor, 0);
      const semBase = v.manutencao.descontoPagoSugerido == null;
      console.log(
        `  🔧 Desconto manutenção: R$ ${fmt(totManut)}` +
          (semBase ? "  ⚠️ sem segmento locado p/ valorizar a diária — perguntar valor" : ""),
      );
      for (const it of v.manutencaoItens) console.log(`     • ${it.descricao}`);
    }

    if (v.reserva.substituiPlacas.length) {
      console.log(`  ↪ reserva substitui: ${v.reserva.substituiPlacas.join(", ")}`);
    }
  }
  console.log(
    "\nValores (por valorPago) são SUGESTÃO a partir de locacoes.json — validar com o utilizador antes de montar a entrada do relatório.",
  );
}

function fmt(v: number | null): string {
  return v == null
    ? "0,00"
    : Number(v).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

export function main(argv: string[]): void {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.log(HELP);
    return;
  }
  const rest = argv.slice(1);
  switch (sub) {
    case "add":
    case "gravar":
      add(rest);
      break;
    case "listar":
    case "list":
      listar(rest);
      break;
    case "sugerir":
    case "sugestao":
      sugerir(rest);
      break;
    case "excluir":
    case "remover":
      excluir(rest);
      break;
    default:
      console.error(`Subcomando desconhecido: ${sub}\n`);
      console.log(HELP);
      process.exit(1);
  }
}
