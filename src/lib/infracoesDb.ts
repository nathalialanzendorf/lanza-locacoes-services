import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import type { DetranScInfracao, DetranScMultaNormalizada, StatusInfracaoDetran } from "./detranSc/types.js";
import { inferirCondutorInfracao, parseDataAutuacao } from "./inferirCondutorInfracao.js";
import { infracaoNaoCobravelDetran } from "./infracaoTitulo.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import type { ParceiroDespesaInput } from "./parceiroDespesasDb.js";
import { competenciaFromData } from "./parceiroDespesasDb.js";
import { REPO_ROOT } from "./repoRoot.js";

type CondutorResolvido = {
  condutorId: string | null;
  condutorContrato: string | null;
  condutorConfirmado: boolean;
  naoIdentificado: boolean;
  aviso: string | null;
};

function resolverCondutorVigencia(
  veiculoId: string,
  dataAutuacao: string,
  prazoDias = 90,
): CondutorResolvido {
  const sug = inferirCondutorInfracao(veiculoId, dataAutuacao, prazoDias);
  if (sug.condutorId) {
    return {
      condutorId: sug.condutorId,
      condutorContrato: sug.condutorContrato,
      condutorConfirmado: true,
      naoIdentificado: false,
      aviso: sug.aviso,
    };
  }
  if (!sug.condutorContrato) {
    return {
      condutorId: null,
      condutorContrato: null,
      condutorConfirmado: true,
      naoIdentificado: true,
      aviso: sug.aviso,
    };
  }
  return {
    condutorId: null,
    condutorContrato: sug.condutorContrato,
    condutorConfirmado: false,
    naoIdentificado: false,
    aviso: sug.aviso,
  };
}

export const DB_INFRACOES = path.join(REPO_ROOT, "database", "infracoes.json");

/** Registro canônico de infração DETRAN — fonte da verdade para dados do portal. */
export type InfracaoRegistro = {
  id: string;
  /** Chave natural (= `autoInfracao` / DETRAN `numeroAuto`). */
  numeroAuto: string;
  /** ID numérico do auto no DETRAN SC (`idAutoInfracao`). */
  idAutoInfracao?: number | null;
  veiculoId: string;
  descricao: string;
  /** DD/MM/AAAA HH:mm — compatível com cliente-despesas e inferência de condutor. */
  dataAutuacao: string;
  /** ISO ou texto bruto do DETRAN (`dataHoraAutuacao`). */
  dataHoraAutuacao?: string | null;
  localInfracao: string;
  valor: number;
  /** Alias legado (= `valor`). */
  valorMulta: number;
  /** Texto bruto DETRAN (`situacao`). */
  situacao: string;
  /** Status bruto do portal (`status`, ex.: "Em aberto"). */
  status?: string | null;
  protocolo?: string | null;
  /** Prazo de defesa da autuação (DD/MM/AAAA). */
  dataLimiteDefesa: string;
  /** Espelho legado — autuação → dataLimiteDefesa; débito → dataVencimentoOriginal. */
  limiteDefesa: string;
  prazoDefesaExpirado?: boolean;
  /** Vencimento original do boleto (DD/MM/AAAA). */
  dataVencimentoOriginal?: string;
  convertidaEmDebito?: boolean;
  quitadaDetran?: boolean;
  statusInfracao?: StatusInfracaoDetran | string;
  statusDetran?: string;
  /** Bloco DETRAN de origem na última sync. */
  fonte?: "infracoes" | "debitos" | "historicoInfracoes";
  condutorId: string | null;
  condutorConfirmado: boolean;
  condutorContrato: string | null;
  condutorNaoIdentificado?: boolean;
  revisarManual?: boolean;
  revisarMotivo?: string | null;
  pdfArquivo?: string | null;
  /** uuid em cliente-despesas.json quando existe débito cobrável espelhado. */
  clienteDespesaId?: string | null;
  /** Payload bruto do DETRAN (campos extras entre versões do portal). */
  detranRaw?: Record<string, unknown> | null;
  origem: string;
  syncEm?: string | null;
  cadastradoEm: string;
  atualizadoEm: string;
  ativo?: boolean;
};

export type InfracaoInput = {
  numeroAuto: string;
  idAutoInfracao?: number | null;
  descricao: string;
  dataAutuacao: string;
  dataHoraAutuacao?: string | null;
  localInfracao: string;
  valorMulta: number;
  situacao: string;
  status?: string | null;
  protocolo?: string | null;
  dataLimiteDefesa: string;
  limiteDefesa?: string;
  prazoDefesaExpirado?: boolean;
  dataVencimentoOriginal?: string;
  convertidaEmDebito?: boolean;
  quitadaDetran?: boolean;
  statusInfracao?: string;
  statusDetran?: string;
  fonte?: InfracaoRegistro["fonte"];
  detranRaw?: Record<string, unknown> | null;
  origem?: string;
};

export type InfracoesDb = {
  descricao?: string;
  atualizadoEm?: string;
  schemaInfracao?: Record<string, string>;
  infracoes: InfracaoRegistro[];
};

export type SincronizarInfracaoResult = {
  registro: InfracaoRegistro;
  aviso: string | null;
  acao: "novo" | "atualizado" | "sem_alteracao" | "ignorado";
};

const DEFAULT_DESCRICAO =
  "Infrações de trânsito sincronizadas do DETRAN SC. Chave natural: numeroAuto (case-insensitive). Com condutor na data da autuação → espelho cobrável em cliente-despesas.json; sem contrato/locatário → parceiro-despesas.json (custo do parceiro).";

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid",
  numeroAuto: "Número do auto DETRAN — chave natural (case-insensitive)",
  idAutoInfracao: "ID numérico do auto no DETRAN SC",
  veiculoId: "Placa do veículo (ABC-1D23)",
  descricao: "Texto cru do DETRAN",
  dataAutuacao: "DD/MM/AAAA HH:mm",
  dataHoraAutuacao: "ISO ou texto bruto DETRAN (dataHoraAutuacao)",
  localInfracao: "Endereço/local da autuação",
  valor: "Valor em reais (autuação ou débito atualizado)",
  situacao: "Situação bruta DETRAN (ex.: Penalidade notificada)",
  status: "Status bruto DETRAN (ex.: Em aberto)",
  protocolo: "Protocolo DETRAN",
  dataLimiteDefesa: "Prazo de defesa da autuação (DD/MM/AAAA)",
  limiteDefesa: "Espelho legado — autuação: dataLimiteDefesa; débito: dataVencimentoOriginal",
  prazoDefesaExpirado: "boolean — prazo de defesa expirado no DETRAN",
  dataVencimentoOriginal: "Vencimento original do boleto (DD/MM/AAAA)",
  convertidaEmDebito: "boolean — infração convertida em débito",
  quitadaDetran: "boolean — quitada no DETRAN",
  statusInfracao: "Advertida | Paga | Notificada | Justificada",
  statusDetran: "advertida | paga | justificada",
  fonte: "infracoes | debitos | historicoInfracoes",
  condutorId: "uuid -> clientes.json",
  condutorConfirmado: "boolean",
  condutorContrato: "Pasta do contrato usado na inferência",
  condutorNaoIdentificado: "boolean — sem locatário na autuação (espelho parceiro-despesas)",
  revisarManual: "boolean — precisa revisão (ex.: sem data)",
  revisarMotivo: "Motivo da revisão manual",
  pdfArquivo: "Caminho do PDF (pasta Débitos)",
  clienteDespesaId: "uuid -> cliente-despesas.json (débito cobrável espelhado)",
  detranRaw: "Payload bruto DETRAN (campos extras)",
  origem: "detran-sc | backfill-cliente-despesas | manual",
  syncEm: "ISO 8601 — última sync DETRAN",
  cadastradoEm: "ISO 8601",
  atualizadoEm: "ISO 8601",
  ativo: "boolean — false = excluído",
};

function nowIso(): string {
  return new Date().toISOString();
}

function autoKey(numeroAuto: string): string {
  return String(numeroAuto).trim().toUpperCase();
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseValor(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = String(v ?? "")
    .replace(/R\$\s*/i, "")
    .trim();
  if (!s) return 0;
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Converte ISO `YYYY-MM-DDTHH:mm:ss` → `DD/MM/AAAA HH:mm`. */
export function isoParaDataHoraBr(iso: string): string {
  const t = String(iso ?? "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return t;
  const hora =
    m[4] != null ? ` ${m[4]}:${m[5] ?? "00"}${m[6] ? `:${m[6]}` : ""}` : "";
  return `${m[3]}/${m[2]}/${m[1]}${hora}`;
}

/** Monta input a partir da multa normalizada + objeto bruto DETRAN. */
export function inputInfracaoFromDetran(
  m: DetranScMultaNormalizada,
  rawItem?: DetranScInfracao | Record<string, unknown> | null,
): InfracaoInput {
  const raw = (rawItem ?? {}) as Record<string, unknown>;
  const dataHoraAutuacao = pickStr(raw, ["dataHoraAutuacao", "dataHora", "localDataHoraMulta"]);
  const dataAutuacao =
    m.dataAutuacao ||
    (dataHoraAutuacao ? isoParaDataHoraBr(dataHoraAutuacao) : "") ||
    isoParaDataHoraBr(pickStr(raw, ["dataAutuacao", "data"]));

  const idRaw = raw.idAutoInfracao ?? raw.id;
  const idAutoInfracao =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && /^\d+$/.test(idRaw.trim())
        ? Number(idRaw.trim())
        : null;

  const prazoRaw = raw.prazoDefesaExpirado;
  const prazoDefesaExpirado =
    typeof prazoRaw === "boolean"
      ? prazoRaw
      : String(prazoRaw ?? "").toLowerCase() === "true"
        ? true
        : undefined;

  return {
    numeroAuto: m.numeroAuto,
    idAutoInfracao,
    descricao: m.descricao,
    dataAutuacao,
    dataHoraAutuacao: dataHoraAutuacao || null,
    localInfracao: m.localInfracao,
    valorMulta: m.valorMulta,
    situacao: m.situacao,
    status: pickStr(raw, ["status"]) || null,
    protocolo: pickStr(raw, ["protocolo"]) || null,
    dataLimiteDefesa: m.dataLimiteDefesa,
    limiteDefesa: m.limiteDefesa,
    prazoDefesaExpirado,
    dataVencimentoOriginal: m.dataVencimentoOriginal || undefined,
    convertidaEmDebito: m.convertidaEmDebito,
    quitadaDetran: m.quitadaDetran,
    statusInfracao: m.statusInfracao,
    statusDetran: m.statusDetran,
    fonte: m.fonte,
    detranRaw: rawItem ? { ...raw } : null,
    origem: "detran-sc",
  };
}

/**
 * Infração deve ter espelho em cliente-despesas.json (cobrança/Rastreame/encerramento).
 * Regra: condutor ou contrato na data da autuação; sem locatário → parceiro-despesas.
 */
export function infracaoDeveEspelharClienteDespesa(reg: Pick<
  InfracaoRegistro,
  | "numeroAuto"
  | "quitadaDetran"
  | "statusInfracao"
  | "statusDetran"
  | "condutorNaoIdentificado"
  | "revisarManual"
  | "condutorId"
  | "condutorContrato"
  | "clienteDespesaId"
>): boolean {
  if (!reg.numeroAuto?.trim()) return false;
  // Quitada/advertida/etc.: só mantém espelho cliente se já existia (baixa DETRAN).
  if (infracaoNaoCobravelDetran(reg)) return !!reg.clienteDespesaId;
  if (reg.revisarManual === true) return false;
  if (reg.condutorNaoIdentificado === true) return false;
  if (reg.condutorId) return true;
  // Contrato sugerido sem cliente em clientes.json — não cobrar locatário.
  if (reg.condutorContrato) return !!reg.clienteDespesaId;
  return false;
}

/**
 * Infração sem locatário na autuação → débito do parceiro/dono (prestação de contas).
 * IPVA e licenciamento seguem fluxo próprio (mapDebitosProprietario); nunca cliente-despesas.
 */
export function infracaoDeveEspelharParceiroDespesa(reg: Pick<
  InfracaoRegistro,
  | "numeroAuto"
  | "quitadaDetran"
  | "statusInfracao"
  | "statusDetran"
  | "condutorNaoIdentificado"
  | "revisarManual"
  | "condutorId"
  | "condutorContrato"
  | "valorMulta"
>): boolean {
  if (!reg.numeroAuto?.trim()) return false;
  if (infracaoNaoCobravelDetran(reg)) return false;
  if (parseValor(reg.valorMulta) <= 0) return false;
  if (reg.condutorNaoIdentificado === true || reg.revisarManual === true) return true;
  if (!reg.condutorId && reg.condutorContrato) return true;
  return false;
}

/** Origem idempotente em parceiro-despesas para multa sem locatário identificado. */
export function origemParceiroInfracaoSemLocatario(placa: string, numeroAuto: string): string {
  const placaKey = compactPlaca(placa);
  const auto = String(numeroAuto).trim().toUpperCase();
  return `detran-sc/infracao-sem-locatario/${placaKey}/${auto}`;
}

function dataVencimentoInfracaoParceiro(reg: Pick<
  InfracaoRegistro,
  "dataVencimentoOriginal" | "dataLimiteDefesa" | "limiteDefesa" | "dataAutuacao"
>): string {
  for (const c of [reg.dataVencimentoOriginal, reg.dataLimiteDefesa, reg.limiteDefesa]) {
    const m = String(c ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
    if (m) return m[1]!;
  }
  const da = String(reg.dataAutuacao ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
  return da?.[1] ?? "";
}

/** Converte infração canônica → input de parceiro-despesas (sem locatário na autuação). */
export function parceiroDespesaInputFromInfracao(reg: InfracaoRegistro): ParceiroDespesaInput {
  const data = dataVencimentoInfracaoParceiro(reg);
  return {
    placa: reg.veiculoId,
    categoria: "Outros",
    descricao: `Multa sem locatário — ${reg.descricao} (${reg.numeroAuto})`,
    data,
    valor: reg.valorMulta,
    competencia: competenciaFromData(data),
    origem: origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto),
  };
}

/** Débito cobrável ao locatário (exclui advertida/paga/justificada e sem contrato na autuação). */
export function infracaoCobravelLocatario(reg: Pick<
  InfracaoRegistro,
  | "quitadaDetran"
  | "statusInfracao"
  | "statusDetran"
  | "condutorNaoIdentificado"
  | "revisarManual"
  | "condutorId"
  | "condutorContrato"
>): boolean {
  if (infracaoNaoCobravelDetran(reg)) return false;
  if (reg.condutorNaoIdentificado === true) return false;
  if (reg.revisarManual === true) return false;
  return !!(reg.condutorId || reg.condutorContrato);
}

function registroChanged(a: InfracaoRegistro, input: InfracaoInput): boolean {
  return (
    a.situacao !== String(input.situacao).trim() ||
    a.valorMulta !== parseValor(input.valorMulta) ||
    a.limiteDefesa !== String(input.limiteDefesa ?? input.dataLimiteDefesa).trim() ||
    (input.dataLimiteDefesa !== undefined &&
      a.dataLimiteDefesa !== String(input.dataLimiteDefesa).trim()) ||
    (input.dataVencimentoOriginal !== undefined &&
      (a.dataVencimentoOriginal ?? "") !== String(input.dataVencimentoOriginal).trim()) ||
    (input.convertidaEmDebito !== undefined &&
      !!a.convertidaEmDebito !== !!input.convertidaEmDebito) ||
    (input.statusInfracao !== undefined && a.statusInfracao !== input.statusInfracao) ||
    a.descricao !== String(input.descricao).trim() ||
    a.localInfracao !== String(input.localInfracao).trim() ||
    (input.dataAutuacao ? a.dataAutuacao !== String(input.dataAutuacao).trim() : false) ||
    (input.quitadaDetran === true && a.quitadaDetran !== true) ||
    (input.quitadaDetran === false && a.quitadaDetran === true) ||
    (input.statusDetran !== undefined && a.statusDetran !== input.statusDetran) ||
    (input.status !== undefined && (a.status ?? null) !== (input.status ?? null)) ||
    (input.protocolo !== undefined && (a.protocolo ?? null) !== (input.protocolo ?? null)) ||
    (input.idAutoInfracao !== undefined && (a.idAutoInfracao ?? null) !== (input.idAutoInfracao ?? null)) ||
    (input.prazoDefesaExpirado !== undefined &&
      !!a.prazoDefesaExpirado !== !!input.prazoDefesaExpirado)
  );
}

function aplicarCondutor(
  reg: InfracaoRegistro,
  veiculoId: string,
  dataAutuacao: string,
  quitada: boolean,
  prazoDias: number,
): CondutorResolvido | null {
  if (quitada) {
    if (!reg.condutorConfirmado) reg.condutorConfirmado = true;
    if (reg.condutorNaoIdentificado) reg.condutorNaoIdentificado = false;
    return null;
  }
  if (!dataAutuacao || !parseDataAutuacao(dataAutuacao)) return null;
  if (reg.condutorConfirmado && reg.condutorId) return null;
  return resolverCondutorVigencia(veiculoId, dataAutuacao, prazoDias);
}

export function loadInfracoesDb(): InfracoesDb {
  if (!fs.existsSync(DB_INFRACOES)) {
    return {
      descricao: DEFAULT_DESCRICAO,
      atualizadoEm: new Date().toISOString().slice(0, 10),
      schemaInfracao: DEFAULT_SCHEMA,
      infracoes: [],
    };
  }
  const raw = JSON.parse(fs.readFileSync(DB_INFRACOES, "utf8")) as Record<string, unknown>;
  const infracoes = (raw.infracoes ?? []) as InfracaoRegistro[];
  return {
    descricao: (raw.descricao as string) || DEFAULT_DESCRICAO,
    atualizadoEm: (raw.atualizadoEm as string) || new Date().toISOString().slice(0, 10),
    schemaInfracao: (raw.schemaInfracao as Record<string, string>) || DEFAULT_SCHEMA,
    infracoes,
  };
}

export function saveInfracoesDb(db: InfracoesDb): void {
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  if (!db.schemaInfracao) db.schemaInfracao = DEFAULT_SCHEMA;
  fs.writeFileSync(DB_INFRACOES, JSON.stringify(db, null, 2), "utf8");
}

export function findInfracaoByNumeroAuto(numeroAuto: string): InfracaoRegistro | null {
  const key = autoKey(numeroAuto);
  const db = loadInfracoesDb();
  return db.infracoes.find((i) => autoKey(i.numeroAuto) === key) ?? null;
}

export function vincularClienteDespesaInfracao(
  numeroAuto: string,
  clienteDespesaId: string,
): InfracaoRegistro | null {
  const db = loadInfracoesDb();
  const key = autoKey(numeroAuto);
  const idx = db.infracoes.findIndex((i) => autoKey(i.numeroAuto) === key);
  if (idx < 0) return null;
  const reg = db.infracoes[idx]!;
  if (reg.clienteDespesaId === clienteDespesaId) return reg;
  reg.clienteDespesaId = clienteDespesaId;
  reg.atualizadoEm = nowIso();
  db.infracoes[idx] = reg;
  saveInfracoesDb(db);
  return reg;
}

export function atualizarPdfArquivoInfracaoDb(
  numeroAuto: string,
  pdfArquivo: string,
): InfracaoRegistro | null {
  const db = loadInfracoesDb();
  const key = autoKey(numeroAuto);
  const idx = db.infracoes.findIndex((i) => autoKey(i.numeroAuto) === key);
  if (idx < 0) return null;
  const reg = db.infracoes[idx]!;
  if (reg.pdfArquivo === pdfArquivo) return reg;
  reg.pdfArquivo = pdfArquivo;
  reg.atualizadoEm = nowIso();
  db.infracoes[idx] = reg;
  saveInfracoesDb(db);
  return reg;
}

export function sincronizarInfracao(
  veiculoIdRaw: string,
  input: InfracaoInput,
  opts?: { prazoDias?: number; dryRun?: boolean },
): SincronizarInfracaoResult {
  const veiculoId = formatPlacaHyphen(veiculoIdRaw);
  const key = autoKey(input.numeroAuto);
  const quitada = input.quitadaDetran === true;
  const dataFinal = String(input.dataAutuacao ?? "").trim();

  if (opts?.dryRun) {
    return {
      registro: {
        id: "(dry-run)",
        numeroAuto: String(input.numeroAuto).trim(),
        veiculoId,
        descricao: String(input.descricao).trim(),
        dataAutuacao: dataFinal,
        localInfracao: String(input.localInfracao).trim(),
        valor: parseValor(input.valorMulta),
        valorMulta: parseValor(input.valorMulta),
        situacao: String(input.situacao).trim(),
        dataLimiteDefesa: String(input.dataLimiteDefesa).trim(),
        limiteDefesa: String(input.limiteDefesa ?? input.dataLimiteDefesa).trim(),
        condutorId: null,
        condutorConfirmado: quitada,
        condutorContrato: null,
        quitadaDetran: quitada,
        statusInfracao: input.statusInfracao,
        statusDetran: input.statusDetran,
        origem: input.origem ?? "detran-sc",
        cadastradoEm: "",
        atualizadoEm: "",
      },
      aviso: null,
      acao: "novo",
    };
  }

  const db = loadInfracoesDb();
  const idx = db.infracoes.findIndex((i) => autoKey(i.numeroAuto) === key);
  const ts = nowIso();

  if (idx < 0) {
    let condutorId: string | null = null;
    let condutorContrato: string | null = null;
    let condutorConfirmado = quitada;
    let naoIdentificado = false;
    let revisarManual = false;
    let aviso: string | null = null;

    if (!quitada) {
      if (!dataFinal || !parseDataAutuacao(dataFinal)) {
        revisarManual = true;
        aviso = dataFinal ? `Data de autuação inválida: ${dataFinal}` : "Sem data de autuação";
      } else {
        const res = resolverCondutorVigencia(veiculoId, dataFinal, opts?.prazoDias ?? 90);
        condutorId = res.condutorId;
        condutorContrato = res.condutorContrato;
        condutorConfirmado = res.condutorConfirmado;
        naoIdentificado = res.naoIdentificado;
        aviso = res.aviso;
      }
    }

    const valor = parseValor(input.valorMulta);
    const registro: InfracaoRegistro = {
      id: crypto.randomUUID(),
      numeroAuto: String(input.numeroAuto).trim(),
      idAutoInfracao: input.idAutoInfracao ?? null,
      veiculoId,
      descricao: String(input.descricao).trim(),
      dataAutuacao: dataFinal,
      dataHoraAutuacao: input.dataHoraAutuacao ?? null,
      localInfracao: String(input.localInfracao).trim(),
      valor,
      valorMulta: valor,
      situacao: String(input.situacao).trim(),
      status: input.status ?? null,
      protocolo: input.protocolo ?? null,
      dataLimiteDefesa: String(input.dataLimiteDefesa).trim(),
      limiteDefesa: String(input.limiteDefesa ?? input.dataLimiteDefesa).trim(),
      prazoDefesaExpirado: input.prazoDefesaExpirado,
      dataVencimentoOriginal: input.dataVencimentoOriginal,
      convertidaEmDebito: input.convertidaEmDebito,
      quitadaDetran: quitada || undefined,
      statusInfracao: input.statusInfracao,
      statusDetran: input.statusDetran,
      fonte: input.fonte,
      condutorId,
      condutorConfirmado,
      condutorContrato,
      condutorNaoIdentificado: naoIdentificado || undefined,
      revisarManual: revisarManual || undefined,
      revisarMotivo: revisarManual ? "Sem data de autuação no DETRAN — revisar manualmente" : null,
      detranRaw: input.detranRaw ?? null,
      origem: input.origem ?? "detran-sc",
      syncEm: ts,
      cadastradoEm: ts,
      atualizadoEm: ts,
      ativo: true,
    };

    db.infracoes.push(registro);
    saveInfracoesDb(db);
    return { registro, aviso, acao: "novo" };
  }

  const reg = db.infracoes[idx]!;
  const dataInput = String(input.dataAutuacao ?? "").trim();
  const dataEfetiva = dataInput || String(reg.dataAutuacao ?? "").trim();
  const semDataValida = !dataEfetiva || !parseDataAutuacao(dataEfetiva);
  const desejaRevisar = semDataValida && !quitada;
  const flagRevisarMudou = !!reg.revisarManual !== desejaRevisar;

  if (!registroChanged(reg, input) && !flagRevisarMudou && !(quitada && !reg.condutorConfirmado)) {
    return { registro: reg, aviso: null, acao: "sem_alteracao" };
  }

  const sitIn = String(input.situacao ?? "").trim();
  if (sitIn) reg.situacao = sitIn;
  const valorIn = parseValor(input.valorMulta);
  if (valorIn > 0) reg.valor = reg.valorMulta = valorIn;
  else if (!(quitada && reg.valorMulta > 0)) reg.valor = reg.valorMulta = valorIn;

  const limIn = String(input.limiteDefesa ?? input.dataLimiteDefesa ?? "").trim();
  if (limIn) reg.limiteDefesa = limIn;
  if (input.dataLimiteDefesa !== undefined) reg.dataLimiteDefesa = String(input.dataLimiteDefesa).trim();
  if (input.dataVencimentoOriginal !== undefined) {
    reg.dataVencimentoOriginal = String(input.dataVencimentoOriginal).trim();
  }
  if (input.convertidaEmDebito === true) reg.convertidaEmDebito = true;
  if (input.convertidaEmDebito === false) reg.convertidaEmDebito = false;
  if (input.numeroAuto) reg.numeroAuto = String(input.numeroAuto).trim();
  if (input.idAutoInfracao !== undefined) reg.idAutoInfracao = input.idAutoInfracao ?? null;
  if (input.status !== undefined) reg.status = input.status ?? null;
  if (input.protocolo !== undefined) reg.protocolo = input.protocolo ?? null;
  if (input.prazoDefesaExpirado !== undefined) reg.prazoDefesaExpirado = input.prazoDefesaExpirado;
  if (input.descricao) reg.descricao = String(input.descricao).trim();
  if (input.localInfracao) reg.localInfracao = String(input.localInfracao).trim();
  if (input.dataAutuacao) reg.dataAutuacao = String(input.dataAutuacao).trim();
  if (input.dataHoraAutuacao !== undefined) reg.dataHoraAutuacao = input.dataHoraAutuacao;
  if (input.quitadaDetran === true) reg.quitadaDetran = true;
  if (input.quitadaDetran === false) reg.quitadaDetran = false;
  if (input.statusInfracao !== undefined) reg.statusInfracao = input.statusInfracao;
  if (input.statusDetran !== undefined) reg.statusDetran = input.statusDetran;
  if (input.fonte !== undefined) reg.fonte = input.fonte;
  if (input.detranRaw) reg.detranRaw = { ...input.detranRaw };
  reg.origem = input.origem ?? reg.origem;
  reg.syncEm = ts;
  reg.atualizadoEm = ts;

  if (desejaRevisar) {
    reg.revisarManual = true;
    reg.revisarMotivo = "Sem data de autuação no DETRAN — revisar manualmente";
  } else if (reg.revisarManual) {
    reg.revisarManual = false;
    reg.revisarMotivo = null;
  }

  const condRes = aplicarCondutor(reg, veiculoId, dataEfetiva, quitada, opts?.prazoDias ?? 90);
  if (condRes) {
    reg.condutorId = condRes.condutorId;
    reg.condutorContrato = condRes.condutorContrato;
    if (condRes.condutorConfirmado) reg.condutorConfirmado = true;
    if (condRes.naoIdentificado) reg.condutorNaoIdentificado = true;
  }

  db.infracoes[idx] = reg;
  saveInfracoesDb(db);
  return {
    registro: reg,
    aviso: input.origem === "detran-sc" ? "sync detran-sc" : null,
    acao: "atualizado",
  };
}

/** Converte registro de infração para input de cliente-despesas (espelho cobrável). */
export function clienteDespesaInputFromInfracao(reg: InfracaoRegistro): {
  autoInfracao: string;
  numeroAuto: string;
  descricao: string;
  localInfracao: string;
  dataAutuacao: string;
  valorMulta: number;
  situacao: string;
  limiteDefesa: string;
  dataLimiteDefesa?: string;
  dataVencimentoOriginal?: string;
  convertidaEmDebito?: boolean;
  quitadaDetran?: boolean;
  statusInfracao?: string;
  statusDetran?: string;
  categoria: string;
  origem: string;
} {
  return {
    autoInfracao: reg.numeroAuto,
    numeroAuto: reg.numeroAuto,
    descricao: reg.descricao,
    localInfracao: reg.localInfracao,
    dataAutuacao: reg.dataAutuacao,
    valorMulta: reg.valorMulta,
    situacao: reg.situacao,
    limiteDefesa: reg.limiteDefesa,
    dataLimiteDefesa: reg.dataLimiteDefesa,
    dataVencimentoOriginal: reg.dataVencimentoOriginal,
    convertidaEmDebito: reg.convertidaEmDebito,
    quitadaDetran: reg.quitadaDetran,
    statusInfracao: reg.statusInfracao as string | undefined,
    statusDetran: reg.statusDetran,
    categoria: "Infração",
    origem: reg.origem,
  };
}
