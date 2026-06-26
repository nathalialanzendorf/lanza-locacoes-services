import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";

export const DB_PARCEIRO_DESPESAS = path.join(
  REPO_ROOT,
  "database",
  "parceiro-despesas.json",
);
const DB_DESPESAS_LEGACY = path.join(REPO_ROOT, "database", "despesas.json");
export const DB_VEICULOS = path.join(REPO_ROOT, "database", "veiculos.json");

export type ParceiroDespesaRegistro = {
  id: string;
  veiculoId: string | null;
  placa: string;
  categoria: string;
  descricao: string;
  data: string;
  valor: number;
  competencia: string;
  origem: string;
};

export type ParceiroDespesaInput = {
  placa: string;
  categoria: string;
  descricao: string;
  data: string;
  valor: number | string;
  competencia?: string;
  origem?: string;
};

/** @deprecated use ParceiroDespesaInput */
export type DespesaInput = ParceiroDespesaInput;

/** @deprecated use ParceiroDespesaRegistro */
export type DespesaRegistro = ParceiroDespesaRegistro;

type ParceiroDespesasDb = {
  descricao?: string;
  atualizadoEm?: string;
  schemaParceiroDespesa?: Record<string, string>;
  /** @deprecated leitura legacy */
  schemaDespesa?: Record<string, string>;
  parceiroDespesas: ParceiroDespesaRegistro[];
};

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid (despesa)",
  veiculoId: "uuid -> veiculos.json (null se placa não cadastrada)",
  placa: "Placa do veículo (ABC-1D23)",
  categoria: "Seguro | Rastreador | Manutenção | IPVA | Licenciamento | Outros",
  descricao: "Descrição do débito",
  data: "DD/MM/AAAA (vencimento/competência)",
  valor: "número (reais)",
  competencia: "MM/AAAA",
  origem: "manual | detran-sc | caminho boleto | ...",
};

const DEFAULT_DESCRICAO =
  "Débitos a cobrar dos parceiros/donos por veículo (IPVA, Licenciamento, Seguro, Rastreador, Manutenção, etc.). Consumido por relatorio-prestacao-contas.";

function parseValor(v: number | string): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = String(v).replace(/R\$\s*/i, "").trim();
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${v}`);
  return Math.round(n * 100) / 100;
}

export function competenciaFromData(data: string): string {
  const m1 = data.match(/(\d{2})\/(\d{4})$/);
  if (m1) return `${m1[1]}/${m1[2]}`;
  const m2 = data.match(/^\d{2}\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[1]}/${m2[2]}`;
  return "";
}

function resolveVeiculo(placa: string): { id: string | null; placa: string } {
  const veic = JSON.parse(fs.readFileSync(DB_VEICULOS, "utf8")) as {
    veiculos: { id: string; placa: string }[];
  };
  const key = compactPlaca(placa);
  const v = veic.veiculos.find((x) => compactPlaca(x.placa) === key);
  return { id: v?.id ?? null, placa: v?.placa ?? formatPlacaHyphen(placa) };
}

function normalizeRawDb(raw: Record<string, unknown>): ParceiroDespesasDb {
  const parceiroDespesas = (raw.parceiroDespesas ??
    raw.despesas ??
    []) as ParceiroDespesaRegistro[];
  return {
    descricao: (raw.descricao as string) || DEFAULT_DESCRICAO,
    atualizadoEm: (raw.atualizadoEm as string) || new Date().toISOString().slice(0, 10),
    schemaParceiroDespesa:
      (raw.schemaParceiroDespesa as Record<string, string>) ||
      (raw.schemaDespesa as Record<string, string>) ||
      DEFAULT_SCHEMA,
    parceiroDespesas,
  };
}

function migrateLegacyDespesasIfNeeded(): void {
  if (fs.existsSync(DB_PARCEIRO_DESPESAS) || !fs.existsSync(DB_DESPESAS_LEGACY)) return;
  const raw = JSON.parse(fs.readFileSync(DB_DESPESAS_LEGACY, "utf8")) as Record<
    string,
    unknown
  >;
  saveParceiroDespesasDb(normalizeRawDb(raw));
  fs.unlinkSync(DB_DESPESAS_LEGACY);
}

export function loadParceiroDespesasDb(): ParceiroDespesasDb {
  migrateLegacyDespesasIfNeeded();
  if (!fs.existsSync(DB_PARCEIRO_DESPESAS)) {
    return {
      descricao: DEFAULT_DESCRICAO,
      atualizadoEm: new Date().toISOString().slice(0, 10),
      schemaParceiroDespesa: DEFAULT_SCHEMA,
      parceiroDespesas: [],
    };
  }
  const raw = JSON.parse(fs.readFileSync(DB_PARCEIRO_DESPESAS, "utf8")) as Record<
    string,
    unknown
  >;
  return normalizeRawDb(raw);
}

export function saveParceiroDespesasDb(db: ParceiroDespesasDb): void {
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  fs.writeFileSync(DB_PARCEIRO_DESPESAS, JSON.stringify(db, null, 2), "utf8");
}

/** @deprecated use loadParceiroDespesasDb */
export function loadDespesasDb(): ParceiroDespesasDb {
  return loadParceiroDespesasDb();
}

/** @deprecated use saveParceiroDespesasDb */
export function saveDespesasDb(db: ParceiroDespesasDb): void {
  saveParceiroDespesasDb(db);
}

export type GravarParceiroDespesaResult = {
  registro: ParceiroDespesaRegistro;
  aviso: string | null;
  acao: "novo" | "atualizado" | "sem_alteracao";
};

/** @deprecated */
export type GravarDespesaResult = GravarParceiroDespesaResult;

function despesaChanged(
  a: ParceiroDespesaRegistro,
  input: ParceiroDespesaInput,
  valor: number,
): boolean {
  return (
    a.valor !== valor ||
    a.data !== String(input.data).trim() ||
    a.descricao !== String(input.descricao).trim() ||
    a.categoria !== String(input.categoria).trim()
  );
}

export function sincronizarParceiroDespesa(
  input: ParceiroDespesaInput,
): GravarParceiroDespesaResult {
  const db = loadParceiroDespesasDb();
  const valor = parseValor(input.valor);
  const { id: veiculoId, placa } = resolveVeiculo(input.placa);
  const competencia = input.competencia?.trim() || competenciaFromData(input.data);
  const origem = input.origem?.trim() || "manual";

  if (origem !== "manual") {
    const idx = db.parceiroDespesas.findIndex((d) => d.origem === origem);
    if (idx >= 0) {
      const ex = db.parceiroDespesas[idx]!;
      if (!despesaChanged(ex, input, valor)) {
        return { registro: ex, aviso: null, acao: "sem_alteracao" };
      }
      ex.categoria = String(input.categoria).trim();
      ex.descricao = String(input.descricao).trim();
      ex.data = String(input.data).trim();
      ex.valor = valor;
      ex.competencia = competencia;
      ex.placa = placa;
      ex.veiculoId = veiculoId;
      db.parceiroDespesas[idx] = ex;
      saveParceiroDespesasDb(db);
      return {
        registro: ex,
        aviso: veiculoId ? null : "placa não cadastrada em veiculos.json",
        acao: "atualizado",
      };
    }
  }

  const registro: ParceiroDespesaRegistro = {
    id: crypto.randomUUID(),
    veiculoId,
    placa,
    categoria: String(input.categoria).trim(),
    descricao: String(input.descricao).trim(),
    data: String(input.data).trim(),
    valor,
    competencia,
    origem,
  };
  db.parceiroDespesas.push(registro);
  saveParceiroDespesasDb(db);
  return {
    registro,
    aviso: veiculoId ? null : "placa não cadastrada em veiculos.json",
    acao: "novo",
  };
}

/** @deprecated use sincronizarParceiroDespesa */
export function sincronizarDespesa(input: ParceiroDespesaInput): GravarParceiroDespesaResult {
  return sincronizarParceiroDespesa(input);
}

export function gravarParceiroDespesaManual(
  input: ParceiroDespesaInput,
): GravarParceiroDespesaResult {
  return sincronizarParceiroDespesa({ ...input, origem: "manual" });
}

/** @deprecated use gravarParceiroDespesaManual */
export function gravarDespesaManual(input: ParceiroDespesaInput): GravarParceiroDespesaResult {
  return gravarParceiroDespesaManual(input);
}
