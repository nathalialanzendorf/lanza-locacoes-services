import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { inferirCondutorInfracao } from "./inferirCondutorInfracao.js";
import { formatPlacaHyphen } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";

export const DB_CLIENTE_DESPESAS = path.join(
  REPO_ROOT,
  "database",
  "cliente-despesas.json",
);
const DB_INFRACOES_LEGACY = path.join(REPO_ROOT, "database", "infracoes.json");
const DB_MULTAS_LEGACY = path.join(REPO_ROOT, "database", "multas.json");

export type ClienteDespesaRegistro = {
  id: string;
  categoria?: string;
  veiculoId: string;
  autoInfracao: string;
  descricao: string;
  localInfracao: string;
  dataAutuacao: string;
  valorMulta: number;
  situacao: string;
  limiteDefesa: string;
  condutorId: string | null;
  condutorConfirmado: boolean;
  condutorContrato: string | null;
  paga?: boolean;
  pagaEm?: string | null;
  quitadaDetran?: boolean;
  cadastradoEm: string;
  atualizadoEm: string;
  origem: string;
};

export type ClienteDespesaInput = {
  autoInfracao: string;
  descricao: string;
  localInfracao: string;
  dataAutuacao: string;
  valorMulta: number | string;
  situacao: string;
  limiteDefesa: string;
  categoria?: string;
  origem?: string;
  quitadaDetran?: boolean;
};

/** @deprecated use ClienteDespesaRegistro */
export type InfracaoRegistro = ClienteDespesaRegistro;

/** @deprecated use ClienteDespesaInput */
export type InfracaoInput = ClienteDespesaInput;

type ClienteDespesasDb = {
  descricao?: string;
  atualizadoEm?: string;
  schemaClienteDespesa?: Record<string, string>;
  /** @deprecated leitura legacy */
  schemaInfracao?: Record<string, string>;
  clienteDespesas: ClienteDespesaRegistro[];
};

const DEFAULT_DESCRICAO =
  "Débitos a cobrar dos locatários/clientes: infrações, locação, caução, manutenção, lavação, quebra de contrato, estacionamento, pedágio, etc.";

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid",
  categoria:
    "Infração | Locação semanal | Caução | Manutenção | Lavação | Quebra contrato | Estacionamento | Pedágio | Outros",
  veiculoId: "Placa do veículo (ABC-1D23)",
  autoInfracao: "Chave natural (auto DETRAN ou id interno)",
  descricao: "Descrição do débito",
  localInfracao: "Local (infrações) ou vazio",
  dataAutuacao: "DD/MM/AAAA HH:mm ou data do débito",
  valorMulta: "Valor em reais",
  situacao: "Situação (DETRAN ou controle interno)",
  limiteDefesa: "DD/MM/AAAA (infrações) ou vencimento",
  condutorId: "uuid -> clientes.json (null se não identificado)",
  condutorConfirmado: "false no cadastro; true após confirmação do usuário",
  condutorContrato: "Pasta do contrato usado na sugestão de condutor",
  paga: "boolean — quitada pelo locatário (default false)",
  pagaEm: "DD/MM/AAAA — quando foi paga (opcional)",
  quitadaDetran: "boolean — quitada no DETRAN (só infrações); não cobrar locatário",
  cadastradoEm: "ISO 8601",
  atualizadoEm: "ISO 8601",
  origem: "manual | portal | detran-sc | ...",
};

function parseValor(v: number | string): number {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const s = String(v).replace(/R\$\s*/i, "").trim();
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${v}`);
  return Math.round(n * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRawDb(raw: Record<string, unknown>): ClienteDespesasDb {
  const rawList = (raw.clienteDespesas ?? raw.infracoes ?? raw.multas ?? []) as ClienteDespesaRegistro[];
  const clienteDespesas = rawList.map((r) => ({
    ...r,
    categoria: r.categoria ?? "Infração",
  }));
  return {
    descricao: (raw.descricao as string) || DEFAULT_DESCRICAO,
    atualizadoEm: (raw.atualizadoEm as string) || new Date().toISOString().slice(0, 10),
    schemaClienteDespesa:
      (raw.schemaClienteDespesa as Record<string, string>) ||
      (raw.schemaInfracao as Record<string, string>) ||
      (raw.schemaMulta as Record<string, string>) ||
      DEFAULT_SCHEMA,
    clienteDespesas,
  };
}

function migrateLegacyFile(from: string, remove: string): void {
  if (fs.existsSync(DB_CLIENTE_DESPESAS) || !fs.existsSync(from)) return;
  const raw = JSON.parse(fs.readFileSync(from, "utf8")) as Record<string, unknown>;
  saveClienteDespesasDb(normalizeRawDb(raw));
  fs.unlinkSync(remove);
}

function migrateLegacyIfNeeded(): void {
  if (!fs.existsSync(DB_CLIENTE_DESPESAS)) {
    if (fs.existsSync(DB_INFRACOES_LEGACY)) {
      migrateLegacyFile(DB_INFRACOES_LEGACY, DB_INFRACOES_LEGACY);
      return;
    }
    if (fs.existsSync(DB_MULTAS_LEGACY)) {
      migrateLegacyFile(DB_MULTAS_LEGACY, DB_MULTAS_LEGACY);
    }
  }
}

export function loadClienteDespesasDb(): ClienteDespesasDb {
  migrateLegacyIfNeeded();
  if (!fs.existsSync(DB_CLIENTE_DESPESAS)) {
    return {
      descricao: DEFAULT_DESCRICAO,
      atualizadoEm: new Date().toISOString().slice(0, 10),
      schemaClienteDespesa: DEFAULT_SCHEMA,
      clienteDespesas: [],
    };
  }
  const raw = JSON.parse(fs.readFileSync(DB_CLIENTE_DESPESAS, "utf8")) as Record<string, unknown>;
  return normalizeRawDb(raw);
}

export function saveClienteDespesasDb(db: ClienteDespesasDb): void {
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  fs.writeFileSync(DB_CLIENTE_DESPESAS, JSON.stringify(db, null, 2), "utf8");
}

/** @deprecated use loadClienteDespesasDb */
export function loadInfracoesDb(): ClienteDespesasDb {
  return loadClienteDespesasDb();
}

/** @deprecated use saveClienteDespesasDb */
export function saveInfracoesDb(db: ClienteDespesasDb): void {
  saveClienteDespesasDb(db);
}

export type GravarClienteDespesaResult = {
  registro: ClienteDespesaRegistro;
  aviso: string | null;
  duplicado: boolean;
};

export type SincronizarClienteDespesaResult = {
  registro: ClienteDespesaRegistro;
  aviso: string | null;
  acao: "novo" | "atualizado" | "sem_alteracao";
};

/** @deprecated */
export type GravarInfracaoResult = GravarClienteDespesaResult;

/** @deprecated */
export type SincronizarInfracaoResult = SincronizarClienteDespesaResult;

function registroChanged(
  a: ClienteDespesaRegistro,
  input: ClienteDespesaInput & { quitadaDetran?: boolean },
): boolean {
  return (
    a.situacao !== String(input.situacao).trim() ||
    a.valorMulta !== parseValor(input.valorMulta) ||
    a.limiteDefesa !== String(input.limiteDefesa).trim() ||
    a.descricao !== String(input.descricao).trim() ||
    a.localInfracao !== String(input.localInfracao).trim() ||
    (input.dataAutuacao ? a.dataAutuacao !== String(input.dataAutuacao).trim() : false) ||
    (input.quitadaDetran === true && a.quitadaDetran !== true) ||
    (input.quitadaDetran === false && a.quitadaDetran === true) ||
    (input.categoria ? a.categoria !== input.categoria : false)
  );
}

export function gravarClienteDespesa(
  veiculoIdRaw: string,
  input: ClienteDespesaInput,
  opts?: { prazoDias?: number; skipInferir?: boolean },
): GravarClienteDespesaResult {
  const db = loadClienteDespesasDb();
  const veiculoId = formatPlacaHyphen(veiculoIdRaw);
  const autoKey = String(input.autoInfracao).trim().toUpperCase();
  const categoria = input.categoria?.trim() || "Infração";

  const dup = db.clienteDespesas.find(
    (m) => m.autoInfracao.trim().toUpperCase() === autoKey,
  );
  if (dup) {
    return { registro: dup, aviso: "Auto já cadastrado", duplicado: true };
  }

  let condutorId: string | null = null;
  let condutorContrato: string | null = null;
  let aviso: string | null = null;

  if (!opts?.skipInferir && categoria === "Infração") {
    const sug = inferirCondutorInfracao(veiculoId, input.dataAutuacao, opts?.prazoDias ?? 90);
    condutorId = sug.condutorId;
    condutorContrato = sug.condutorContrato;
    aviso = sug.aviso;
  }

  const ts = nowIso();
  const registro: ClienteDespesaRegistro = {
    id: crypto.randomUUID(),
    categoria,
    veiculoId,
    autoInfracao: String(input.autoInfracao).trim(),
    descricao: String(input.descricao).trim(),
    localInfracao: String(input.localInfracao).trim(),
    dataAutuacao: String(input.dataAutuacao).trim(),
    valorMulta: parseValor(input.valorMulta),
    situacao: String(input.situacao).trim(),
    limiteDefesa: String(input.limiteDefesa).trim(),
    condutorId,
    condutorConfirmado: false,
    condutorContrato,
    cadastradoEm: ts,
    atualizadoEm: ts,
    origem: input.origem ?? "manual",
  };

  if (input.quitadaDetran === true) registro.quitadaDetran = true;

  db.clienteDespesas.push(registro);
  saveClienteDespesasDb(db);
  return { registro, aviso, duplicado: false };
}

/** @deprecated use gravarClienteDespesa */
export function gravarInfracao(
  veiculoIdRaw: string,
  input: ClienteDespesaInput,
  opts?: { prazoDias?: number; skipInferir?: boolean },
): GravarClienteDespesaResult {
  return gravarClienteDespesa(veiculoIdRaw, { ...input, categoria: input.categoria ?? "Infração" }, opts);
}

export function sincronizarClienteDespesa(
  veiculoIdRaw: string,
  input: ClienteDespesaInput,
  opts?: { prazoDias?: number; fonteDetran?: string },
): SincronizarClienteDespesaResult {
  const db = loadClienteDespesasDb();
  const veiculoId = formatPlacaHyphen(veiculoIdRaw);
  const autoKey = String(input.autoInfracao).trim().toUpperCase();
  const categoria = input.categoria?.trim() || "Infração";
  const idx = db.clienteDespesas.findIndex(
    (m) => m.autoInfracao.trim().toUpperCase() === autoKey,
  );

  if (idx < 0) {
    const r = gravarClienteDespesa(veiculoId, { ...input, categoria }, { prazoDias: opts?.prazoDias });
    return { registro: r.registro, aviso: r.aviso, acao: "novo" };
  }

  const m = db.clienteDespesas[idx]!;
  if (!registroChanged(m, { ...input, categoria })) {
    return { registro: m, aviso: null, acao: "sem_alteracao" };
  }

  m.categoria = categoria;
  m.situacao = String(input.situacao).trim();
  m.valorMulta = parseValor(input.valorMulta);
  m.limiteDefesa = String(input.limiteDefesa).trim();
  m.descricao = String(input.descricao).trim();
  if (input.localInfracao) m.localInfracao = String(input.localInfracao).trim();
  if (input.dataAutuacao) m.dataAutuacao = String(input.dataAutuacao).trim();
  if (input.quitadaDetran === true) m.quitadaDetran = true;
  if (input.quitadaDetran === false) m.quitadaDetran = false;
  m.origem = input.origem ?? m.origem;
  m.atualizadoEm = nowIso();

  if (!m.condutorConfirmado && !m.condutorId && input.dataAutuacao && categoria === "Infração") {
    const sug = inferirCondutorInfracao(veiculoId, input.dataAutuacao, opts?.prazoDias ?? 90);
    m.condutorId = sug.condutorId;
    m.condutorContrato = sug.condutorContrato;
  }

  db.clienteDespesas[idx] = m;
  saveClienteDespesasDb(db);
  return {
    registro: m,
    aviso: opts?.fonteDetran ? `sync ${opts.fonteDetran}` : null,
    acao: "atualizado",
  };
}

/** @deprecated use sincronizarClienteDespesa */
export function sincronizarInfracao(
  veiculoIdRaw: string,
  input: ClienteDespesaInput,
  opts?: { prazoDias?: number; fonteDetran?: string },
): SincronizarClienteDespesaResult {
  return sincronizarClienteDespesa(
    veiculoIdRaw,
    { ...input, categoria: input.categoria ?? "Infração" },
    opts,
  );
}

export function confirmarCondutorClienteDespesa(
  autoInfracao: string,
  condutorId?: string | null,
): ClienteDespesaRegistro | null {
  const db = loadClienteDespesasDb();
  const key = autoInfracao.trim().toUpperCase();
  const idx = db.clienteDespesas.findIndex((m) => m.autoInfracao.trim().toUpperCase() === key);
  if (idx < 0) return null;

  const m = db.clienteDespesas[idx]!;
  if (condutorId !== undefined) m.condutorId = condutorId;
  m.condutorConfirmado = true;
  m.atualizadoEm = nowIso();
  db.clienteDespesas[idx] = m;
  saveClienteDespesasDb(db);
  return m;
}

/** @deprecated use confirmarCondutorClienteDespesa */
export function confirmarCondutorInfracao(
  autoInfracao: string,
  condutorId?: string | null,
): ClienteDespesaRegistro | null {
  return confirmarCondutorClienteDespesa(autoInfracao, condutorId);
}

export function isInfracaoTransito(r: ClienteDespesaRegistro): boolean {
  return (r.categoria ?? "Infração") === "Infração";
}
