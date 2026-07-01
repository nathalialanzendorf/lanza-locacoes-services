/**
 * Monta o plano de baixa de recebimento (pré-visualização — não grava).
 * Usado pela skill cadastro-recebimento (modo unitário e lote PagBank).
 */
import fs from "node:fs";
import path from "node:path";

import {
  loadClienteDespesasDb,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
} from "../clienteDespesasDb.js";
import { findClienteByCpf, normNomeKey, type ClienteRegistro } from "../clientesDb.js";
import {
  dataBrComHora,
  dataVencimentoSemanalBr,
  isPagamentoSemanalDescricao,
  proximaParcelaSemanal,
  stripAtrasadoSemanal,
} from "../pagamentoSemanal.js";
import { REPO_ROOT } from "../repoRoot.js";
import { verificarIdempotenciaBaixa } from "./idempotenciaBaixa.js";
export type { IdempotenciaBaixa, IdempotenciaStatus } from "./idempotenciaBaixa.js";

export type LinhaPlanoBaixa = {
  num: number;
  operacao: "atualizar" | "criar";
  autoInfracao: string | null;
  rastreavel: string;
  data: string;
  descricao: string;
  motorista: string;
  tipo: string;
  total: number;
  patch?: ClienteDespesaPatch;
  comprovanteRastreame?: string | null;
  /** Referência externa (ex.: id PagBank) — só informativo. */
  origemExterna?: string | null;
};

export type PlanoBaixaRecebimento = {
  cliente: { id: string; nome: string; cpf: string | null };
  pagamento: {
    valor: number;
    dataBr: string;
    horaBr: string | null;
    pagaEmIso: string;
  };
  despesaAlvo: {
    autoInfracao: string;
    descricaoAtual: string;
    valorDevido: number;
    dataVencimento: string;
    /** Dias entre recebimento e vencimento previsto (+ = após vencimento). */
    diasDoVencimento: number | null;
  } | null;
  tipoBaixa: "integral" | "parcial" | "integral_desconto";
  linhas: LinhaPlanoBaixa[];
  avisos: string[];
  /** Match PagBank: operador deve confirmar manualmente antes de gravar. */
  revisaoManual?: boolean;
  /** Pagamento ou despesa alvo já existente no database — confirmar antes de gravar. */
  idempotencia?: IdempotenciaBaixa;
};

type VeiculoDb = {
  placa?: string;
  id?: string;
  rastreameLabel?: string;
};

function loadVeiculos(): VeiculoDb[] {
  const p = path.join(REPO_ROOT, "database", "veiculos.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as { veiculos?: VeiculoDb[] };
  return j.veiculos ?? [];
}

function loadClientes(): ClienteRegistro[] {
  const p = path.join(REPO_ROOT, "database", "clientes.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as { clientes?: ClienteRegistro[] };
  return j.clientes ?? [];
}

export function rastreavelLabel(veiculoId: string): string {
  const v = loadVeiculos().find((x) => x.placa === veiculoId || x.id === veiculoId);
  return v?.rastreameLabel ?? veiculoId;
}

export function tipoRastreame(categoria?: string): string {
  switch (categoria) {
    case "Renegociação":
      return "DOCUMENTACAO";
    case "Pedágio":
    case "Estacionamento":
      return "PEDAGIO";
    case "Infração":
      return "MULTA";
    case "Manutenção":
      return "ALIMENTACAO";
    default:
      return "OUTROS";
  }
}

/** Resolve cliente por nome parcial, CPF ou id. */
export function resolverCliente(query: string): ClienteRegistro {
  const q = query.trim();
  if (!q) throw new Error("Informe --cliente (nome, CPF ou id).");

  const byCpf = findClienteByCpf(q);
  if (byCpf) return byCpf;

  const list = loadClientes();
  const byId = list.find((c) => c.id === q);
  if (byId) return byId;

  const nk = normNomeKey(q);
  const matches = list.filter((c) => {
    const cn = normNomeKey(c.nome);
    return cn.includes(nk) || nk.includes(cn);
  });
  if (matches.length === 0) {
    throw new Error(`Cliente "${query}" não encontrado em clientes.json.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Vários clientes para "${query}": ${matches.map((m) => `${m.nome} (${m.cpf})`).join("; ")} — refine o nome ou use CPF.`,
    );
  }
  return matches[0]!;
}

export function parseValorInput(raw: string): number {
  const n = Number(String(raw).replace(/\./g, "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Valor inválido: ${raw}`);
  }
  return Math.round(n * 100) / 100;
}

/** DD/MM/AAAA ou DD/MM (ano corrente) ou AAAA-MM-DD. */
export function parseDataBr(raw: string, anoPadrao?: number): string {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${m[3]}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const y = anoPadrao ?? new Date().getFullYear();
    return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${y}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  throw new Error(`Data inválida: ${raw} (use DD/MM/AAAA ou DD/MM).`);
}

/** HH:MM ou HH:MM:SS */
export function parseHoraBr(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Hora inválida: ${raw} (use HH:MM).`);
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export function dataHoraToPagaEmIso(dataBr: string, horaBr: string | null): string {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Data inválida: ${dataBr}`);
  const [hh, mm] = (horaBr ?? "12:00").split(":").map((x) => x.padStart(2, "0"));
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:00-03:00`).toISOString();
}

function despesasAbertasCliente(clienteId: string, opts?: { excluirCategorias?: string[] }): ClienteDespesaRegistro[] {
  const excluir = new Set(opts?.excluirCategorias ?? []);
  const db = loadClienteDespesasDb();
  return db.clienteDespesas
    .filter(
      (d) =>
        d.condutorId === clienteId &&
        d.ativo !== false &&
        d.paga !== true &&
        (d.situacao === "Em aberto" || !d.paga) &&
        !excluir.has(d.categoria ?? ""),
    )
    .sort((a, b) => {
      const da = a.dataAutuacao.split("/").reverse().join("");
      const dbd = b.dataAutuacao.split("/").reverse().join("");
      return da.localeCompare(dbd);
    });
}

function parseDataBrToMs(dataBr: string): number | null {
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Dias entre data do recebimento e vencimento previsto (+ = recebeu depois). */
export function diasDoVencimento(dataRecebimentoBr: string, dataVencimentoBr: string): number | null {
  const r = parseDataBrToMs(dataRecebimentoBr);
  const v = parseDataBrToMs(dataVencimentoBr);
  if (r == null || v == null) return null;
  return Math.round((r - v) / 86_400_000);
}

function dataPrevistaPagamento(d: ClienteDespesaRegistro): string {
  if (d.categoria === "Locação semanal" && isPagamentoSemanalDescricao(d.descricao)) {
    return dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao;
  }
  return d.dataAutuacao;
}

function janelaDiasDespesa(d: ClienteDespesaRegistro): { min: number; max: number } {
  if (d.categoria === "Locação semanal" && isPagamentoSemanalDescricao(d.descricao)) {
    return { min: -7, max: 14 };
  }
  return { min: -45, max: 45 };
}

function dentroDaJanela(delta: number, d: ClienteDespesaRegistro): boolean {
  const { min, max } = janelaDiasDespesa(d);
  return delta >= min && delta <= max;
}

function escolherDespesaAlvo(
  abertas: ClienteDespesaRegistro[],
  valor: number,
  dataRecebimentoBr: string,
): ClienteDespesaRegistro | null {
  const semanais = abertas.filter(
    (d) => d.categoria === "Locação semanal" && /ATRASADO/i.test(d.descricao),
  );
  const pool = semanais.length > 0 ? semanais : abertas;
  if (pool.length === 0) return null;

  type Scored = {
    d: ClienteDespesaRegistro;
    delta: number;
    absDelta: number;
    venc: string;
  };

  const scored: Scored[] = pool.map((d) => {
    const venc = dataPrevistaPagamento(d);
    const delta = diasDoVencimento(dataRecebimentoBr, venc) ?? 9999;
    return { d, delta, absDelta: Math.abs(delta), venc };
  });

  const inWindow = scored.filter((s) => dentroDaJanela(s.delta, s.d));
  if (semanais.length > 0 && inWindow.length === 0) {
    return null;
  }

  const candidates = inWindow.length > 0 ? inWindow : scored;

  candidates.sort((a, b) => {
    const aExato = Math.abs(a.d.valorMulta - valor) < 0.01 ? 0 : 1;
    const bExato = Math.abs(b.d.valorMulta - valor) < 0.01 ? 0 : 1;
    if (aExato !== bExato) return aExato - bExato;
    if (a.absDelta !== b.absDelta) return a.absDelta - b.absDelta;
    if (a.delta >= 0 && b.delta < 0) return -1;
    if (b.delta >= 0 && a.delta < 0) return 1;
    return a.venc.localeCompare(b.venc);
  });

  return candidates[0]?.d ?? null;
}

function previewProximaParcela(
  pago: ClienteDespesaRegistro,
  descricaoAntes: string,
  valorParcela: number,
): LinhaPlanoBaixa | null {
  const vencimentoAntes =
    pago.categoria === "Locação semanal" && isPagamentoSemanalDescricao(descricaoAntes)
      ? dataVencimentoSemanalBr(descricaoAntes, pago.rastreameDataIso) ?? pago.dataAutuacao
      : pago.dataAutuacao;
  const prox = proximaParcelaSemanal(descricaoAntes, vencimentoAntes);
  if (!prox) return null;

  const db = loadClienteDespesasDb();
  const alvo = stripAtrasadoSemanal(prox.descricao).toLowerCase();
  const dup = db.clienteDespesas.some(
    (d) =>
      d.ativo !== false &&
      d.veiculoId === pago.veiculoId &&
      d.categoria === "Locação semanal" &&
      stripAtrasadoSemanal(d.descricao).toLowerCase() === alvo,
  );
  if (dup) return null;

  const aberto = db.clienteDespesas.some(
    (d) =>
      d.ativo !== false &&
      d.paga !== true &&
      d.veiculoId === pago.veiculoId &&
      d.condutorId === pago.condutorId &&
      d.categoria === "Locação semanal" &&
      /ATRASADO/i.test(d.descricao) &&
      d.autoInfracao !== pago.autoInfracao,
  );
  if (aberto) return null;

  return {
    num: 0,
    operacao: "criar",
    autoInfracao: null,
    rastreavel: rastreavelLabel(pago.veiculoId),
    data: prox.dataAutuacao,
    descricao: prox.descricao,
    motorista: "",
    tipo: tipoRastreame(pago.categoria),
    total: valorParcela,
  };
}

export type MontarPlanoBaixaInput = {
  clienteQuery: string;
  valor: number;
  dataBr: string;
  horaBr?: string | null;
  comprovante?: string | null;
  /** Força baixa integral com valor menor que o devido (desconto). */
  desconto?: boolean;
  origemExterna?: string | null;
  /** Ex.: omitir Infração no match automático PagBank (Juliano). */
  excluirCategoriasAuto?: string[];
  revisaoManual?: boolean;
};

export function montarPlanoBaixa(input: MontarPlanoBaixaInput): PlanoBaixaRecebimento {
  const cliente = resolverCliente(input.clienteQuery);
  const dataBr = parseDataBr(input.dataBr);
  const horaBr = parseHoraBr(input.horaBr);
  const pagaEmIso = dataHoraToPagaEmIso(dataBr, horaBr);
  const valor = input.valor;
  const avisos: string[] = [];

  const abertas = despesasAbertasCliente(cliente.id!, {
    excluirCategorias: input.excluirCategoriasAuto,
  });
  const alvo = escolherDespesaAlvo(abertas, valor, dataBr);

  if (!alvo) {
    return {
      cliente: { id: cliente.id!, nome: cliente.nome, cpf: cliente.cpf ?? null },
      pagamento: { valor, dataBr, horaBr, pagaEmIso },
      despesaAlvo: null,
      tipoBaixa: "integral",
      linhas: [],
      avisos: [
        abertas.length > 0
          ? `Nenhuma despesa em aberto com vencimento próximo à data do recebimento (${dataBr}).`
          : "Nenhuma despesa em aberto encontrada para este cliente.",
      ],
    };
  }

  const motorista = cliente.nome;
  const rastreavel = rastreavelLabel(alvo.veiculoId);
  const tipo = tipoRastreame(alvo.categoria);
  const valorDevido = alvo.valorMulta;
  const vencimento =
    alvo.categoria === "Locação semanal" && isPagamentoSemanalDescricao(alvo.descricao)
      ? dataVencimentoSemanalBr(alvo.descricao, alvo.rastreameDataIso) ?? alvo.dataAutuacao
      : alvo.dataAutuacao;
  const deltaVenc = diasDoVencimento(dataBr, vencimento);

  if (deltaVenc != null && !dentroDaJanela(deltaVenc, alvo)) {
    const { min, max } = janelaDiasDespesa(alvo);
    avisos.push(
      `Recebimento (${dataBr}) fora da janela do vencimento (${vencimento}): ${deltaVenc}d (aceite ${min}..${max}).`,
    );
  } else if (deltaVenc != null && deltaVenc > 0) {
    avisos.push(`Recebimento ${deltaVenc} dia(s) após o vencimento previsto (${vencimento}).`);
  }

  const diff = Math.round((valorDevido - valor) * 100) / 100;
  let tipoBaixa: PlanoBaixaRecebimento["tipoBaixa"];

  if (Math.abs(diff) < 0.01) {
    tipoBaixa = "integral";
  } else if (valor < valorDevido && (input.desconto || input.comprovante)) {
    tipoBaixa = "integral_desconto";
    avisos.push(
      `Valor pago (R$ ${valor.toFixed(2)}) menor que devido (R$ ${valorDevido.toFixed(2)}) — tratado como integral com desconto.`,
    );
  } else if (valor < valorDevido) {
    tipoBaixa = "parcial";
  } else {
    tipoBaixa = "integral";
    if (valor > valorDevido) {
      avisos.push(
        `Valor pago (R$ ${valor.toFixed(2)}) maior que devido (R$ ${valorDevido.toFixed(2)}); baixa integral na despesa ${alvo.autoInfracao}.`,
      );
    }
  }

  const linhas: LinhaPlanoBaixa[] = [];
  const descricaoAntes = alvo.descricao;

  if (tipoBaixa === "parcial") {
    const saldo = Math.round((valorDevido - valor) * 100) / 100;
    const descQuitada = stripAtrasadoSemanal(descricaoAntes);
    linhas.push({
      num: 1,
      operacao: "atualizar",
      autoInfracao: alvo.autoInfracao,
      rastreavel,
      data: vencimento,
      descricao: descricaoAntes,
      motorista,
      tipo,
      total: saldo,
      patch: {
        valorMulta: saldo,
        paga: false,
        situacao: "Em aberto",
      },
      origemExterna: input.origemExterna,
    });
    const dataPagamento = dataBrComHora(dataBr, horaBr);
    linhas.push({
      num: 2,
      operacao: "criar",
      autoInfracao: null,
      rastreavel,
      data: dataPagamento,
      descricao: descQuitada,
      motorista,
      tipo,
      total: valor,
      patch: {
        descricao: descQuitada,
        valorMulta: valor,
        dataAutuacao: dataPagamento,
        paga: true,
        pagaEm: pagaEmIso,
        rastreameDataIso: pagaEmIso,
        situacao: "Registrado",
        categoria: alvo.categoria,
        rastreameMotoristaKey: alvo.rastreameMotoristaKey,
        rastreameRastreavelKey: alvo.rastreameRastreavelKey,
        rastreameTipo: alvo.rastreameTipo ?? "OUTROS",
      },
      comprovanteRastreame: input.comprovante ?? null,
      origemExterna: input.origemExterna,
    });
  } else {
    const descQuitada = stripAtrasadoSemanal(descricaoAntes);
    const patch: ClienteDespesaPatch = {
      paga: true,
      pagaEm: pagaEmIso,
      situacao: "Registrado",
    };
    if (tipoBaixa === "integral_desconto") {
      patch.valorMulta = valor;
    }
    linhas.push({
      num: 1,
      operacao: "atualizar",
      autoInfracao: alvo.autoInfracao,
      rastreavel,
      data: dataBrComHora(dataBr, horaBr),
      descricao: descQuitada,
      motorista,
      tipo,
      total: valor,
      patch,
      comprovanteRastreame: input.comprovante ?? null,
      origemExterna: input.origemExterna,
    });

    const prox = previewProximaParcela(alvo, descricaoAntes, valor);
    if (prox) {
      prox.num = 2;
      prox.motorista = motorista;
      linhas.push(prox);
    }
  }

  const idempotencia = verificarIdempotenciaBaixa({
    clienteId: cliente.id!,
    valor,
    dataBr,
    horaBr,
    origemExterna: input.origemExterna,
    autoInfracaoAlvo: alvo.autoInfracao,
    descricaoQuitada: stripAtrasadoSemanal(descricaoAntes),
  });
  if (idempotencia.status !== "ok") {
    avisos.push(`Idempotência (${idempotencia.status}): ${idempotencia.motivo}`);
  }

  return {
    cliente: { id: cliente.id!, nome: cliente.nome, cpf: cliente.cpf ?? null },
    pagamento: { valor, dataBr, horaBr, pagaEmIso },
    despesaAlvo: {
      autoInfracao: alvo.autoInfracao,
      descricaoAtual: alvo.descricao,
      valorDevido,
      dataVencimento: vencimento,
      diasDoVencimento: deltaVenc,
    },
    tipoBaixa,
    linhas,
    avisos,
    revisaoManual: input.revisaoManual || idempotencia.status !== "ok",
    idempotencia,
  };
}

export function formatPlanoTabela(plano: PlanoBaixaRecebimento): string {
  const rows = plano.linhas.map(
    (l) =>
      `| ${l.rastreavel} | ${l.data} | ${l.descricao} | ${l.motorista} | ${l.tipo} | R$ ${l.total.toFixed(2)} |`,
  );
  const total = plano.linhas.reduce((s, l) => s + l.total, 0);
  return [
    "| Rastreável | Data | Descrição | Motorista | Tipo | Total |",
    "|---|---|---|---|---|---|",
    ...rows,
    `| **Total** | | | | | **R$ ${total.toFixed(2)}** |`,
  ].join("\n");
}
