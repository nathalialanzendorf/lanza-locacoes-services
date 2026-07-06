import fs from "node:fs";
import path from "node:path";

import {
  addDays,
  daysBetween,
  extrairContrato,
  fmtDataBr,
  intervaloPagamentoDias,
  parseDataBr,
  startOfDay,
  valorDiariaContrato,
  valorParcelaContrato,
  type ContratoExtraido,
} from "./contratoExtrair.js";
import {
  despesaAtribuidaACliente,
  isInfracaoSemDataAutuacao,
  isCategoriaManutencao,
  isClienteDespesaAtiva,
  isInfracaoTransito,
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import {
  infracaoCobravelRelatorio,
  infracaoIncluirListagemRelatorio,
  rotuloGastoClienteDespesa,
} from "./infracaoTitulo.js";
import { validarContratoVigenteParaEncerramento } from "./contratosDb.js";
import { compactPlaca } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";
import { findVeiculoByPlaca } from "./veiculosDb.js";

export type EncerramentoInput = {
  pastaContrato: string;
  dataEncerramento: string;
  semanasPagas?: string[];
  infracoesPagasAuto?: string[];
  /** @deprecated use infracoesPagasAuto */
  multasPagasAuto?: string[];
  incluirTodasInfracoesPlaca?: boolean;
  /** @deprecated use incluirTodasInfracoesPlaca */
  incluirTodasMultasPlaca?: boolean;
  diasPrimeiroVencimento?: number;
  condutorId?: string | null;
  /**
   * `calculado` — vencimentos semanais + diárias de atraso (default).
   * `abertos-db` — débitos em aberto em cliente-despesas (espelho Rastreame).
   */
  fonteDebitos?: "calculado" | "abertos-db";
  /** Todas as infrações/manutenção em aberto do locatário (qualquer placa), não só a do contrato. */
  incluirInfracoesCliente?: boolean;
};

export type ParcelaAtrasada = {
  vencimento: string;
  valorSemanal: number;
  placa?: string;
  categoria?: string;
  descricao?: string;
};

export type DiariaAtraso = {
  vencimento: string;
  diasAtraso: number;
  valorDiaria: number;
  total: number;
  placa?: string;
  categoria?: string;
};

export type CreditoDevolucao = {
  registro: ClienteDespesaRegistro;
  valor: number;
  descricao: string;
};

export type EncerramentoResult = {
  contrato: ContratoExtraido;
  dataEncerramento: string;
  diasLocacao: number;
  diasRestantes: number;
  proporcaoRestante: number;
  fonteDebitos: "calculado" | "abertos-db";
  infracoes: ClienteDespesaRegistro[];
  totalInfracoes: number;
  /** @deprecated use infracoes */
  multas?: ClienteDespesaRegistro[];
  /** @deprecated use totalInfracoes */
  totalMultas?: number;
  manutencoes: ClienteDespesaRegistro[];
  totalManutencoes: number;
  parcelasEmAberto: ParcelaAtrasada[];
  totalParcelasEmAberto: number;
  diariasAtraso: DiariaAtraso[];
  totalDiariasAtraso: number;
  /** Renegociação, quebra, outros… (modo abertos-db). */
  debitosDiversos: ClienteDespesaRegistro[];
  totalDebitosDiversos: number;
  /** Valores a devolver ao locatário (ex.: "DÉBITO 3 diárias"). */
  creditosDevolucao: CreditoDevolucao[];
  totalCreditosDevolucao: number;
  /** Caução do contrato + créditos explícitos a devolver ao locatário. */
  totalCreditos: number;
  retencaoCaucao: number;
  caucaoDevolver: number;
  totalDebitos: number;
  saldoFinal: number;
  avisos: string[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function brl(v: number): string {
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Valor da retenção por quebra (lançamento Rastreame ou cálculo proporcional). */
export function valorQuebraContratoEncerramento(r: EncerramentoResult): number {
  const quebraDb = r.debitosDiversos.find(
    (m) =>
      (m.categoria ?? "") === "Quebra contrato" ||
      /quebra de contrato|reten[cç][aã]o cau[cç][aã]o.*quebra/i.test(m.descricao ?? ""),
  );
  return quebraDb?.valorMulta ?? r.retencaoCaucao;
}

export function linhaQuebraContratoEncerramento(r: EncerramentoResult): string {
  const c = r.contrato;
  const valor = valorQuebraContratoEncerramento(r);
  return (
    `Quebra de contrato (retenção R$ ${brl(valor)}) — retenção proporcional calculada com base em ` +
    `${c.prazoDias} dias de contrato e ${r.diasLocacao} dias de locação.`
  );
}

function normVencimento(s: string): string {
  const d = parseDataBr(s);
  return d ? fmtDataBr(d) : s.trim();
}

function cpfSoDigitos(cpf: string | null | undefined): string {
  return String(cpf ?? "").replace(/\D/g, "");
}

function loadClienteId(cpf: string | null, condutorId?: string | null): string | null {
  if (condutorId) return condutorId;
  if (!cpf) return null;
  const key = cpfSoDigitos(cpf);
  if (!key) return null;
  const p = path.join(REPO_ROOT, "database", "clientes.json");
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
      clientes?: { id?: string; cpf?: string }[];
    };
    const c = j.clientes?.find((x) => cpfSoDigitos(x.cpf) === key);
    return c?.id ?? null;
  } catch {
    return null;
  }
}

function infracaoExcluidaAcerto(m: ClienteDespesaRegistro, pagasAuto: Set<string>): boolean {
  return !infracaoCobravelRelatorio(m, pagasAuto);
}

function infracaoNoPeriodoEncerramento(
  m: ClienteDespesaRegistro,
  inicio: Date,
  limite: Date,
): boolean {
  const da = parseDataBr(m.dataAutuacao);
  if (!da) return true;
  return da >= startOfDay(inicio) && da <= limite;
}

/** Crédito a devolver ao locatário (descrição começa com CRÉDITO ou legado DÉBITO). */
export function isCreditoDevolucaoLocatario(m: ClienteDespesaRegistro): boolean {
  const t = String(m.descricao ?? "").trim();
  return /^CR[EÉ]DITO\b/i.test(t) || /^D[EÉ]BITO\b/i.test(t);
}

/** Rótulo padronizado para exibição (sempre CRÉDITO). */
export function rotuloCreditoDevolucao(descricao: string): string {
  let t = String(descricao ?? "").trim();
  t = t.replace(/^D[EÉ]BITO\b/i, "CRÉDITO");
  t = t.replace(/^CR[EÉ]DITO\b/i, "CRÉDITO");
  t = t.replace(/vecículo/gi, "veículo");
  t = t.replace(
    /Devolução do veículo antes do prazo da semana \(26\/06 entregue\)/i,
    "devolução antes do prazo (26/06)",
  );
  return t;
}

/** Evita contar espelho RAST-* e DETRAN duas vezes. */
function dedupeInfracoesEspelho(list: ClienteDespesaRegistro[]): ClienteDespesaRegistro[] {
  const rastreamePrimario = new Set<string>();
  for (const m of list) {
    if (m.rastreameId != null && !/^RAST-\d+$/i.test(m.autoInfracao.trim())) {
      rastreamePrimario.add(String(m.rastreameId));
    }
  }
  const out: ClienteDespesaRegistro[] = [];
  const vistos = new Set<string>();
  for (const m of list) {
    const auto = m.autoInfracao.trim().toUpperCase();
    if (
      /^RAST-\d+$/i.test(auto) &&
      m.rastreameId != null &&
      rastreamePrimario.has(String(m.rastreameId))
    ) {
      continue;
    }
    const key = m.detranAutoInfracao?.trim().toUpperCase() || auto;
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(m);
  }
  return out;
}

function despesaNoPeriodo(
  m: ClienteDespesaRegistro,
  inicio: Date,
  encerramento: Date,
): boolean {
  const da = parseDataBr(m.dataAutuacao);
  if (!da) return false;
  return da >= startOfDay(inicio) && da <= encerramento;
}

type ParcelaRenegPlano = { numero: number; total: number };

/** Extrai a/b de descrições tipo "Pagamento renegociação 6x26". */
export function parseParcelaRenegociacaoDescricao(descricao: string): ParcelaRenegPlano | null {
  const d = String(descricao ?? "");
  if (!/renegocia|negocia/i.test(d)) return null;
  const m = d.match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return null;
  const numero = Number(m[1]);
  const total = Number(m[2]);
  if (
    !Number.isFinite(numero) ||
    !Number.isFinite(total) ||
    numero < 1 ||
    total < 1 ||
    numero > total
  ) {
    return null;
  }
  return { numero, total };
}

/**
 * Parcelas de renegociação axb ainda não lançadas no Rastreame entram no acerto
 * (ex.: plano 26x, pagas 1–5 → faltam 6..26).
 */
function expandirRenegociacoesPlanoFaltante(
  contrato: ContratoExtraido,
  clienteId: string | null,
  incluirTodas: boolean,
  diversos: ClienteDespesaRegistro[],
  db: ReturnType<typeof loadClienteDespesasDb>,
): ClienteDespesaRegistro[] {
  const planos = new Map<
    number,
    { maxPago: number; valorParcela: number; ref?: ClienteDespesaRegistro }
  >();

  for (const m of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(m)) continue;
    if ((m.categoria ?? "") !== "Renegociação") continue;
    if (!despesaDoContrato(m, contrato, clienteId, incluirTodas)) continue;
    const parsed = parseParcelaRenegociacaoDescricao(m.descricao);
    if (!parsed) continue;

    const cur = planos.get(parsed.total) ?? { maxPago: 0, valorParcela: 0 };
    if (m.paga === true) {
      cur.maxPago = Math.max(cur.maxPago, parsed.numero);
    }
    if (m.valorMulta > 0 && m.rastreameTipo === "DOCUMENTACAO") {
      cur.valorParcela = m.valorMulta;
    } else if (m.valorMulta > 0 && cur.valorParcela <= 0) {
      cur.valorParcela = m.valorMulta;
    }
    if (m.paga !== true) {
      cur.ref = m;
    }
    planos.set(parsed.total, cur);
  }

  const semPlanoReneg: ClienteDespesaRegistro[] = [];
  const planosAbertos = new Set<number>();

  for (const m of diversos) {
    if ((m.categoria ?? "") !== "Renegociação") {
      semPlanoReneg.push(m);
      continue;
    }
    const parsed = parseParcelaRenegociacaoDescricao(m.descricao);
    if (!parsed || !planos.has(parsed.total)) {
      semPlanoReneg.push(m);
      continue;
    }
    planosAbertos.add(parsed.total);
  }

  const sinteticos: ClienteDespesaRegistro[] = [];
  for (const total of planosAbertos) {
    const info = planos.get(total)!;
    const inicioFaltante = info.maxPago + 1;
    if (inicioFaltante > total) continue;
    const qtd = total - inicioFaltante + 1;
    const valorParcela = info.valorParcela > 0 ? info.valorParcela : 200;
    const valorTotal = round2(qtd * valorParcela);
    const ref = info.ref;
    sinteticos.push({
      ...(ref ?? {}),
      id: ref?.id ?? `plano-reneg-${inicioFaltante}x${total}`,
      categoria: "Renegociação",
      veiculoId: contrato.placa,
      autoInfracao: ref?.autoInfracao ?? `PLANO-${inicioFaltante}x${total}`,
      descricao: `ATRASADO Pagamento renegociação ${inicioFaltante}x${total} (${qtd} parcelas faltantes)`,
      localInfracao: ref?.localInfracao ?? "",
      dataAutuacao: ref?.dataAutuacao ?? fmtDataBr(new Date()),
      valorMulta: valorTotal,
      situacao: ref?.situacao ?? "Em aberto",
      limiteDefesa: ref?.limiteDefesa ?? "",
      condutorId: clienteId,
      condutorConfirmado: ref?.condutorConfirmado ?? false,
      condutorContrato: ref?.condutorContrato ?? null,
      paga: false,
      pagaEm: null,
      origem: ref?.origem ?? "calculado",
      ativo: true,
    } as ClienteDespesaRegistro);
  }

  return [...semPlanoReneg, ...sinteticos];
}

function coletarDebitosAbertosDb(
  contrato: ContratoExtraido,
  encerramento: Date,
  clienteId: string | null,
  incluirTodas: boolean,
  pagasAutoSet: Set<string>,
): {
  parcelasSemanal: ClienteDespesaRegistro[];
  diversos: ClienteDespesaRegistro[];
  creditos: CreditoDevolucao[];
} {
  const db = loadClienteDespesasDb();
  const parcelasSemanal: ClienteDespesaRegistro[] = [];
  const diversos: ClienteDespesaRegistro[] = [];
  const creditos: CreditoDevolucao[] = [];
  /** Lançamentos de acerto no Rastreame podem ser no dia seguinte ao encerramento. */
  const limite = addDays(startOfDay(encerramento), 7);

  for (const m of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(m)) continue;
    if (m.paga === true) continue;
    if (isInfracaoTransito(m) && infracaoExcluidaAcerto(m, pagasAutoSet)) continue;
    if (!despesaDoContrato(m, contrato, clienteId, incluirTodas)) continue;
    const da = parseDataBr(m.dataAutuacao);
    if (da && (da < startOfDay(contrato.inicio) || da > limite)) continue;

    if (isCreditoDevolucaoLocatario(m)) {
      creditos.push({
        registro: m,
        valor: round2(m.valorMulta),
        descricao: rotuloCreditoDevolucao(m.descricao),
      });
      continue;
    }

    if (isInfracaoTransito(m)) continue;
    if (isCategoriaManutencao(m.categoria)) continue;

    if ((m.categoria ?? "") === "Locação semanal") {
      parcelasSemanal.push(m);
      continue;
    }

    diversos.push(m);
  }

  const diversosExpandidos = expandirRenegociacoesPlanoFaltante(
    contrato,
    clienteId,
    incluirTodas,
    diversos,
    db,
  );

  return { parcelasSemanal, diversos: diversosExpandidos, creditos };
}

function despesaDoContrato(
  m: ClienteDespesaRegistro,
  contrato: ContratoExtraido,
  clienteId: string | null,
  incluirTodas: boolean,
): boolean {
  if (compactPlaca(m.veiculoId) !== compactPlaca(contrato.placa)) return false;
  if (incluirTodas) return true;
  if (clienteId && m.condutorId === clienteId) return true;
  if (m.condutorContrato) {
    const norm = (p: string) => path.normalize(p).toLowerCase();
    if (norm(m.condutorContrato) === norm(contrato.pastaContrato)) return true;
  }
  return false;
}

/** @deprecated alias */
function infracaoDoContrato(
  m: ClienteDespesaRegistro,
  contrato: ContratoExtraido,
  clienteId: string | null,
  incluirTodas: boolean,
): boolean {
  return despesaDoContrato(m, contrato, clienteId, incluirTodas);
}

function calcularVencimentos(
  inicio: Date,
  encerramento: Date,
  intervaloDias: number,
): Date[] {
  const out: Date[] = [];
  let due = addDays(startOfDay(inicio), intervaloDias);
  while (due.getTime() <= startOfDay(encerramento).getTime()) {
    out.push(new Date(due));
    due = addDays(due, intervaloDias);
  }
  return out;
}

/** Quitações reais no Rastreame (qualquer placa do locatário no período). */
function inferirSemanasPagasDoDb(
  contrato: ContratoExtraido,
  encerramento: Date,
  clienteId: string | null,
  vencimentos: Date[],
): string[] {
  if (!clienteId || vencimentos.length === 0) return [];
  const db = loadClienteDespesasDb();
  const limite = addDays(startOfDay(encerramento), 7);
  const pagasNoPeriodo = db.clienteDespesas.filter((m) => {
    if (!isClienteDespesaAtiva(m)) return false;
    if (m.paga !== true) return false;
    if ((m.categoria ?? "") !== "Locação semanal") return false;
    if (m.condutorId !== clienteId) return false;
    const da = parseDataBr(m.dataAutuacao);
    return da != null && da >= startOfDay(contrato.inicio) && da <= limite;
  });
  if (pagasNoPeriodo.length < vencimentos.length) return [];
  return vencimentos.map(fmtDataBr);
}

export function calcularEncerramentoContrato(input: EncerramentoInput): EncerramentoResult {
  const contrato = extrairContrato(input.pastaContrato, { paraEncerramento: true });
  const veicReg = findVeiculoByPlaca(contrato.placa);
  if (veicReg?.particular === true) {
    throw new Error(
      `Veículo ${contrato.placa} é PARTICULAR (não-locação) — não há contrato/quebra de contrato.`,
    );
  }
  const registroVigente = validarContratoVigenteParaEncerramento(
    input.pastaContrato,
    contrato.placa,
    contrato.cpf,
    contrato.clienteNome,
  );
  const encerramento = parseDataBr(input.dataEncerramento);
  if (!encerramento) {
    throw new Error(`Data de encerramento inválida: ${input.dataEncerramento}`);
  }
  if (encerramento < startOfDay(contrato.inicio)) {
    throw new Error("Data de encerramento anterior ao início do contrato.");
  }

  const avisos: string[] = [];
  if (contrato.totalDocumentosContrato > 1) {
    const rotuloDoc =
      contrato.versaoDocumento > 0
        ? `v${contrato.versaoDocumento}`
        : path.basename(contrato.docx);
    avisos.push(
      `Renovação: ${contrato.totalDocumentosContrato} documentos na pasta; cálculo só com o mais recente (${rotuloDoc}). Versões anteriores ignoradas.`,
    );
  }
  if (registroVigente && (registroVigente.versao ?? 1) > 1) {
    avisos.push(
      `Contrato v${registroVigente.versao} (renovação); acerto referente só a este período, não a versões anteriores.`,
    );
  }
  if (
    registroVigente?.prazoDias != null &&
    registroVigente.prazoDias > 0 &&
    (contrato.versaoDocumento ?? 1) <= 1
  ) {
    contrato.prazoDias = registroVigente.prazoDias;
  }
  const fimPrevistoDb = registroVigente?.dataFimPrevista
    ? parseDataBr(registroVigente.dataFimPrevista)
    : null;
  if (fimPrevistoDb && (contrato.versaoDocumento ?? 1) <= 1) {
    contrato.fim = fimPrevistoDb;
  }
  const diasLocacao = daysBetween(contrato.inicio, encerramento);
  const diasRestantes = Math.max(0, contrato.prazoDias - diasLocacao);
  const proporcaoRestante = contrato.prazoDias > 0 ? diasRestantes / contrato.prazoDias : 0;
  const retencaoCaucao = round2(contrato.valorCaucao * proporcaoRestante);

  const pagasAutoSet = new Set(
    (input.infracoesPagasAuto ?? input.multasPagasAuto ?? []).map((a) =>
      a.trim().toUpperCase(),
    ),
  );
  const incluirTodas =
    input.incluirTodasInfracoesPlaca === true || input.incluirTodasMultasPlaca === true;

  const clienteId = loadClienteId(contrato.cpf, input.condutorId);
  /** Com locatário cadastrado, espelhar débitos reais (Rastreame) em vez de vencimentos teóricos. */
  const fonteDebitos =
    input.fonteDebitos ?? (clienteId ? "abertos-db" : "calculado");

  const intervalo = input.diasPrimeiroVencimento ?? intervaloPagamentoDias(contrato);
  const valorParcela = valorParcelaContrato(contrato);
  const valorDiaria = valorDiariaContrato(contrato);
  const vencimentos = calcularVencimentos(contrato.inicio, encerramento, intervalo);

  const semanasPagasInformadas = (input.semanasPagas ?? [])
    .map(normVencimento)
    .filter((s) => {
      const d = parseDataBr(s);
      return d != null && d >= startOfDay(contrato.inicio);
    });
  const semanasPagasInferidas =
    fonteDebitos === "calculado" && semanasPagasInformadas.length === 0
      ? inferirSemanasPagasDoDb(contrato, encerramento, clienteId, vencimentos)
      : [];
  const pagasSet = new Set([...semanasPagasInformadas, ...semanasPagasInferidas]);

  let parcelasEmAberto: ParcelaAtrasada[] = [];
  let diariasAtraso: DiariaAtraso[] = [];
  let debitosDiversos: ClienteDespesaRegistro[] = [];
  let creditosDevolucao: CreditoDevolucao[] = [];

  if (fonteDebitos === "abertos-db") {
    avisos.push(
      "Débitos em aberto lidos de cliente-despesas.json (espelho Rastreame). Linhas CRÉDITO são valor a devolver.",
    );
  } else {
    if (semanasPagasInferidas.length > 0) {
      avisos.push(
        `${semanasPagasInferidas.length} vencimento(s) semanal(is) considerado(s) quitado(s) — pagamentos confirmados no Rastreame.`,
      );
    }
    for (const due of vencimentos) {
      const vencStr = fmtDataBr(due);
      if (pagasSet.has(vencStr)) continue;

      parcelasEmAberto.push({
        vencimento: vencStr,
        valorSemanal: valorParcela,
        placa: contrato.placa,
        categoria: "Locação semanal",
        descricao: "Vencimento semanal",
      });

      const diasAtraso = daysBetween(due, encerramento);
      if (diasAtraso > 0) {
        diariasAtraso.push({
          vencimento: vencStr,
          diasAtraso,
          valorDiaria,
          total: round2(diasAtraso * valorDiaria),
          placa: contrato.placa,
          categoria: "Locação semanal",
        });
      }
    }
  }

  const abertosDb = coletarDebitosAbertosDb(
    contrato,
    encerramento,
    clienteId,
    incluirTodas,
    pagasAutoSet,
  );
  if (fonteDebitos === "abertos-db") {
    parcelasEmAberto = abertosDb.parcelasSemanal.map((m) => ({
      vencimento: m.dataAutuacao,
      valorSemanal: round2(m.valorMulta),
      placa: m.veiculoId,
      categoria: m.categoria ?? "Locação semanal",
      descricao: m.descricao,
    }));
  }
  debitosDiversos = abertosDb.diversos;
  creditosDevolucao = abertosDb.creditos;
  const incluirInfracoesCliente =
    input.incluirInfracoesCliente === true ||
    (input.incluirInfracoesCliente !== false && clienteId != null);
  const db = loadClienteDespesasDb();
  /** Lançamentos de acerto podem ser no dia do encerramento ou poucos dias depois. */
  const limiteDespesasEncerramento = addDays(startOfDay(encerramento), 7);
  const infracoes = dedupeInfracoesEspelho(
    db.clienteDespesas.filter((m) => {
      if (!infracaoIncluirListagemRelatorio(m)) return false;
      if (isInfracaoSemDataAutuacao(m) && !m.condutorId) return false;
      if (incluirInfracoesCliente && clienteId && despesaAtribuidaACliente(m, clienteId)) {
        return infracaoNoPeriodoEncerramento(
          m,
          contrato.inicio,
          limiteDespesasEncerramento,
        );
      }
      if (!infracaoDoContrato(m, contrato, clienteId, incluirTodas)) {
        return false;
      }
      return infracaoNoPeriodoEncerramento(
        m,
        contrato.inicio,
        limiteDespesasEncerramento,
      );
    }),
  );

  if (incluirInfracoesCliente) {
    avisos.push(
      "Infrações e manutenção em aberto de todas as placas do locatário incluídas no acerto.",
    );
  }

  if (infracoes.some((m) => !m.condutorConfirmado)) {
    avisos.push(
      "Há infrações com condutor não confirmado — revisar antes de cobrar o locatário.",
    );
  }
  if (!clienteId && !incluirTodas) {
    avisos.push(
      "Cliente não encontrado em clientes.json; infrações filtradas só por pasta do contrato.",
    );
  }

  const totalInfracoes = round2(
    infracoes
      .filter((m) => !infracaoExcluidaAcerto(m, pagasAutoSet))
      .reduce((s, m) => s + m.valorMulta, 0),
  );

  const manutencoes = db.clienteDespesas.filter((m) => {
    if (!isClienteDespesaAtiva(m)) return false;
    if (!isCategoriaManutencao(m.categoria)) return false;
    if (m.paga === true) return false;
    if (pagasAutoSet.has(m.autoInfracao.trim().toUpperCase())) return false;
    if (incluirInfracoesCliente && clienteId && m.condutorId === clienteId) {
      return true;
    }
    if (!despesaDoContrato(m, contrato, clienteId, incluirTodas)) return false;
    const da = parseDataBr(m.dataAutuacao);
    if (!da) return false;
    return da >= startOfDay(contrato.inicio) && da <= limiteDespesasEncerramento;
  });
  if (manutencoes.some((m) => m.valorMulta <= 0)) {
    avisos.push(
      "Há manutenção com orçamento pendente (valor zero) — atualizar quando houver orçamento.",
    );
  }

  const totalManutencoes = round2(
    manutencoes.reduce((s, m) => s + (m.valorMulta > 0 ? m.valorMulta : 0), 0),
  );
  const totalParcelasEmAberto = round2(
    parcelasEmAberto.reduce((s, p) => s + p.valorSemanal, 0),
  );
  const totalDiariasAtraso = round2(
    diariasAtraso.reduce((s, d) => s + d.total, 0),
  );
  const totalDebitosDiversos = round2(
    debitosDiversos.reduce((s, m) => s + (m.valorMulta > 0 ? m.valorMulta : 0), 0),
  );
  const totalCreditosDevolucao = round2(
    creditosDevolucao.reduce((s, c) => s + c.valor, 0),
  );
  const temQuebraRastreame = debitosDiversos.some(
    (m) =>
      (m.categoria ?? "") === "Quebra contrato" ||
      /quebra de contrato|reten[cç][aã]o cau[cç][aã]o.*quebra/i.test(m.descricao ?? ""),
  );
  const retencaoNoTotal = temQuebraRastreame ? 0 : retencaoCaucao;
  if (temQuebraRastreame) {
    avisos.push(
      "Quebra de contrato já lançada no Rastreame — retenção proporcional da caução não somada em duplicidade.",
    );
  }
  const totalDebitos = round2(
    totalInfracoes +
      totalManutencoes +
      totalParcelasEmAberto +
      totalDiariasAtraso +
      totalDebitosDiversos +
      retencaoNoTotal -
      totalCreditosDevolucao,
  );
  const totalCreditos = round2(contrato.valorCaucao + totalCreditosDevolucao);
  const caucaoDevolver = round2(Math.max(0, contrato.valorCaucao - retencaoCaucao));
  const saldoFinal = round2(contrato.valorCaucao - totalDebitos);

  return {
    contrato,
    dataEncerramento: fmtDataBr(encerramento),
    diasLocacao,
    diasRestantes,
    proporcaoRestante: round2(proporcaoRestante),
    fonteDebitos,
    infracoes,
    totalInfracoes,
    multas: infracoes,
    totalMultas: totalInfracoes,
    manutencoes,
    totalManutencoes,
    parcelasEmAberto,
    totalParcelasEmAberto,
    diariasAtraso,
    totalDiariasAtraso,
    debitosDiversos,
    totalDebitosDiversos,
    creditosDevolucao,
    totalCreditosDevolucao,
    totalCreditos,
    retencaoCaucao,
    caucaoDevolver,
    totalDebitos,
    saldoFinal,
    avisos,
  };
}

export function formatarEncerramentoTexto(
  r: EncerramentoResult,
  opts: { incluirAvisos?: boolean; limparNomeCliente?: boolean } = {},
): string {
  const incluirAvisos = opts.incluirAvisos ?? false;
  const limparNomeCliente = opts.limparNomeCliente ?? false;
  const c = r.contrato;
  const clienteNome =
    limparNomeCliente ? c.clienteNome.replace(/\s*\([^)]*\)\s*$/u, "").trim() : c.clienteNome;
  const placaLinha = (veiculoId: string | undefined): string =>
    veiculoId?.trim() || c.placa;
  const linhaItem = (
    descricao: string,
    placa: string,
    data: string,
    categoria: string,
    valor: string,
  ): string => `• ${descricao} — ${placa} — ${data} — ${categoria} — ${valor}`;
  const lines: string[] = [
    "📄 *ENCERRAMENTO DE CONTRATO*",
    "",
    `👤 Cliente: ${clienteNome}`,
    `🚗 Placa: ${c.placa}`,
    `🗓️ Início: ${fmtDataBr(c.inicio)} → Fim previsto: ${fmtDataBr(c.fim)} (${c.prazoDias} dias)`,
    `🏁 Encerramento: ${r.dataEncerramento} (${r.diasLocacao} dias de locação)`,
    "",
    "💵 *Valores base*",
    `• Locação (${c.tipoContrato}): R$ ${brl(valorParcelaContrato(c))}`,
    `• Diária (atraso): R$ ${brl(valorDiariaContrato(c))}`,
    `• Caução: R$ ${brl(c.valorCaucao)}`,
    "",
    "🚦 *Infrações*",
  ];

  if (r.infracoes.length === 0) {
    lines.push("• (nenhuma)");
  } else {
    for (const m of r.infracoes) {
      lines.push(
        linhaItem(
          rotuloGastoClienteDespesa(m),
          placaLinha(m.veiculoId),
          m.dataAutuacao,
          m.categoria ?? "Infração",
          `R$ ${brl(m.valorMulta)}`,
        ),
      );
    }
  }
  lines.push(`💰 Subtotal infrações: R$ ${brl(r.totalInfracoes)}`);
  lines.push("");
  lines.push("🔧 *Manutenção / avarias (em aberto)*");
  if (r.manutencoes.length === 0) {
    lines.push("• (nenhuma)");
  } else {
    for (const m of r.manutencoes) {
      const valor =
        m.valorMulta > 0 ? `R$ ${brl(m.valorMulta)}` : `R$ ${brl(0)}`;
      lines.push(
        linhaItem(
          rotuloGastoClienteDespesa(m),
          placaLinha(m.veiculoId),
          m.dataAutuacao,
          m.categoria ?? "Manutenção",
          valor,
        ),
      );
    }
  }
  lines.push(`💰 Subtotal manutenção: R$ ${brl(r.totalManutencoes)}`);
  lines.push("");
  lines.push("📅 *Parcelas semanais (em aberto)*");
  if (r.parcelasEmAberto.length === 0) {
    lines.push("• (nenhuma)");
  } else {
    for (const p of r.parcelasEmAberto) {
      lines.push(
        linhaItem(
          p.descricao ?? "Vencimento semanal",
          placaLinha(p.placa),
          p.vencimento,
          p.categoria ?? "Locação semanal",
          `R$ ${brl(p.valorSemanal)}`,
        ),
      );
    }
  }
  lines.push(`💰 Subtotal parcelas: R$ ${brl(r.totalParcelasEmAberto)}`);
  lines.push("");
  if (r.fonteDebitos === "calculado") {
    lines.push("⏱️ *Diárias por atraso (após vencimento semanal)*");
    if (r.diariasAtraso.length === 0) {
      lines.push("• (nenhuma)");
    } else {
      for (const d of r.diariasAtraso) {
        lines.push(
          linhaItem(
            `${d.diasAtraso} dia(s) × R$ ${brl(d.valorDiaria)}`,
            placaLinha(d.placa),
            d.vencimento,
            d.categoria ?? "Locação semanal",
            `R$ ${brl(d.total)}`,
          ),
        );
      }
    }
    lines.push(`💰 Subtotal diárias: R$ ${brl(r.totalDiariasAtraso)}`);
    lines.push("");
  }
  if (r.debitosDiversos.length > 0) {
    lines.push("📋 *Outros valores (em aberto)*");
    for (const m of r.debitosDiversos) {
      lines.push(
        linhaItem(
          rotuloGastoClienteDespesa(m),
          placaLinha(m.veiculoId),
          m.dataAutuacao,
          m.categoria ?? "Outros",
          `R$ ${brl(m.valorMulta)}`,
        ),
      );
    }
    lines.push(`💰 Subtotal outros: R$ ${brl(r.totalDebitosDiversos)}`);
    lines.push("");
  }
  if (r.creditosDevolucao.length > 0) {
    lines.push("💚 *Créditos a devolver ao locatário*");
    for (const cr of r.creditosDevolucao) {
      lines.push(
        linhaItem(
          cr.descricao,
          placaLinha(cr.registro.veiculoId),
          cr.registro.dataAutuacao,
          cr.registro.categoria ?? "Crédito",
          `R$ ${brl(cr.valor)}`,
        ),
      );
    }
    lines.push(`💰 Subtotal créditos: R$ ${brl(r.totalCreditosDevolucao)}`);
    lines.push("");
  }
  lines.push(`• ${linhaQuebraContratoEncerramento(r)}`);
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("🧾 *Totais*");
  lines.push(`• Total débitos: R$ ${brl(r.totalDebitos)}`);
  lines.push(`• Total créditos: R$ ${brl(r.totalCreditos)}`);
  lines.push(
    `${r.saldoFinal < 0 ? "🔴" : "✅"} *Saldo: R$ ${brl(r.saldoFinal)}* ${r.saldoFinal < 0 ? "(locatário deve complementar)" : "(a devolver ao locatário)"}`,
  );

  if (incluirAvisos && r.avisos.length) {
    lines.push("");
    lines.push("⚠️ *Avisos*");
    for (const a of r.avisos) lines.push(`• ${a}`);
  }

  return lines.join("\n");
}

/** Texto pronto para colar no WhatsApp (sem avisos internos ao operador). */
export function formatarEncerramentoWhatsApp(r: EncerramentoResult): string {
  return formatarEncerramentoTexto(r, { incluirAvisos: false, limparNomeCliente: true });
}
