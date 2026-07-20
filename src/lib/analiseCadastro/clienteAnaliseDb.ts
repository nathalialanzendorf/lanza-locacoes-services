/**
 * Tabela de achados da análise de cadastro por cliente (`database/cliente-analise.json`).
 *
 * Cada linha registra, de forma granular, **o que foi identificado** para um
 * cliente, **em qual site/fonte** e **quando**. Complementa:
 *   - `database/analise-cadastro.json` — histórico (1 registro por cpf+dia, com
 *     resumo por fonte);
 *   - `database/clientes.json` (coluna `analiseCadastro`) — espelho do resultado.
 *
 * Chave natural: `cpf` + `fonte` + `dataConsulta` (1 linha por site por dia, por
 * CPF). Re-rodar no mesmo dia ATUALIZA a linha (idempotente).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  jsonDocumentExists,
  loadJsonDocument,
  saveJsonDocument,
  useRelationalStore,
  loadClienteAnaliseFromSql,
  saveClienteAnaliseToSql,
  exportJsonBackup,
  type ClienteAnaliseDbShape,
} from "@lanza/db";
import { REPO_ROOT } from "../repoRoot.js";

export const DB_CLIENTE_ANALISE = path.join(REPO_ROOT, "database", "cliente-analise.json");

/** Site público de cada fonte (para a coluna "em qual site"). */
export const SITE_POR_FONTE: Record<string, string> = {
  bnmp: "portalbnmp.cnj.jus.br",
  "pf-sinic": "servicos.pf.gov.br",
  tjsc: "certidoes.tjsc.jus.br",
};

export interface AchadoLinha {
  tipo: string;
  descricao: string;
}

export interface RegistroClienteAnalise {
  id: string;
  clienteId: string | null;
  cpf: string;
  cpfFormatado: string | null;
  nome: string;
  /** Fonte/portal consultado (bnmp | pf-sinic | tjsc). */
  fonte: string;
  fonteNome: string;
  /** Site público da fonte (em qual site). */
  site: string | null;
  status: string;
  /** true quando a fonte sinalizou risco. */
  alerta: boolean;
  /** O que foi identificado (resumo textual da fonte). */
  identificado: string;
  /** Detalhe dos achados (mandados/processos/registros), quando houver. */
  achados: AchadoLinha[];
  /** Evidência salva (ex.: PDF da PF), relativa ao repo. */
  evidencia: string | null;
  /** Quando (data da análise) e timestamp da consulta da fonte. */
  dataConsulta: string;
  consultadoEm: string | null;
  /** Vínculo ao registro do histórico (analise-cadastro.json). */
  analiseId: string | null;
  cadastradoEm: string;
  atualizadoEm: string;
}

interface ClienteAnaliseDb {
  descricao?: string;
  atualizadoEm?: string;
  schema?: Record<string, string>;
  registros: RegistroClienteAnalise[];
}

const DEFAULT_DESCRICAO =
  "Achados da análise de cadastro por cliente: o que foi identificado, em qual site/fonte e quando. 1 linha por cpf+fonte+dataConsulta. clienteId -> clientes.json; analiseId -> analise-cadastro.json. Dados sensíveis de terceiros — só com base legal registrada (LGPD).";

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid",
  clienteId: "uuid -> clientes.json (null se o CPF não está cadastrado)",
  cpf: "CPF só dígitos (11)",
  cpfFormatado: "000.000.000-00",
  nome: "Nome civil consultado",
  fonte: "bnmp | pf-sinic | tjsc",
  fonteNome: "Nome legível da fonte",
  site: "Site público consultado (em qual site)",
  status: "ok | erro | assistido | pendente | pulado",
  alerta: "true se a fonte sinalizou risco",
  identificado: "O que foi identificado (texto-resumo da fonte)",
  achados: "[] { tipo, descricao } — detalhe (mandados/processos)",
  evidencia: "Caminho (relativo ao repo) de evidência (ex.: PDF da PF)",
  dataConsulta: "AAAA-MM-DD — quando a análise foi feita (chave com cpf+fonte)",
  consultadoEm: "ISO 8601 — timestamp da consulta da fonte",
  analiseId: "id em analise-cadastro.json",
  cadastradoEm: "ISO 8601",
  atualizadoEm: "ISO 8601",
};

const nowIso = (): string => new Date().toISOString();
const hojeIso = (): string => new Date().toISOString().slice(0, 10);

function normCpf(cpf: string): string {
  return String(cpf ?? "").replace(/\D/g, "");
}

export function loadClienteAnaliseDb(): ClienteAnaliseDb {
  if (!jsonDocumentExists(DB_CLIENTE_ANALISE)) {
    return {
      descricao: DEFAULT_DESCRICAO,
      atualizadoEm: hojeIso(),
      schema: DEFAULT_SCHEMA,
      registros: [],
    };
  }
  const db = loadJsonDocument<ClienteAnaliseDb>(DB_CLIENTE_ANALISE);
  if (!Array.isArray(db.registros)) db.registros = [];
  if (!db.schema) db.schema = DEFAULT_SCHEMA;
  return db;
}

export async function loadClienteAnaliseDbAsync(): Promise<ClienteAnaliseDb> {
  if (await useRelationalStore()) {
    return (await loadClienteAnaliseFromSql()) as unknown as ClienteAnaliseDb;
  }
  return loadClienteAnaliseDb();
}

export function saveClienteAnaliseDb(db: ClienteAnaliseDb): void {
  db.atualizadoEm = hojeIso();
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schema = DEFAULT_SCHEMA;
  saveJsonDocument(DB_CLIENTE_ANALISE, db, { mkdir: true, trailingNewline: true });
}

export async function saveClienteAnaliseDbAsync(db: ClienteAnaliseDb): Promise<void> {
  db.atualizadoEm = hojeIso();
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schema = DEFAULT_SCHEMA;
  if (await useRelationalStore()) {
    await saveClienteAnaliseToSql(db as unknown as ClienteAnaliseDbShape);
    exportJsonBackup("cliente-analise.json", db);
    return;
  }
  saveJsonDocument(DB_CLIENTE_ANALISE, db, { mkdir: true, trailingNewline: true });
}

/** Fonte normalizada para gravar uma linha (aceita ResultadoFonte ou FonteResumo). */
export interface FonteParaCliente {
  id: string;
  nome: string;
  status: string;
  alerta: boolean;
  observacao: string;
  achados?: AchadoLinha[];
  evidencia?: string | null;
  consultadoEm?: string | null;
}

export interface RegistrarAchadosArgs {
  cpf: string;
  cpfFormatado?: string | null;
  nome: string;
  clienteId?: string | null;
  dataConsulta: string;
  analiseId?: string | null;
  fontes: FonteParaCliente[];
}

/**
 * Grava (upsert por cpf+fonte+dataConsulta) uma linha por fonte consultada.
 * Devolve as linhas resultantes.
 */
export function registrarAchadosCliente(args: RegistrarAchadosArgs): RegistroClienteAnalise[] {
  const db = loadClienteAnaliseDb();
  const ts = nowIso();
  const cpf = normCpf(args.cpf);
  const saidas: RegistroClienteAnalise[] = [];

  for (const f of args.fontes) {
    const achados: AchadoLinha[] = (f.achados ?? []).map((a) => ({
      tipo: String(a.tipo ?? ""),
      descricao: String(a.descricao ?? ""),
    }));
    const idx = db.registros.findIndex(
      (r) => normCpf(r.cpf) === cpf && r.fonte === f.id && r.dataConsulta === args.dataConsulta,
    );
    const base: Omit<RegistroClienteAnalise, "id" | "cadastradoEm"> = {
      clienteId: args.clienteId ?? null,
      cpf,
      cpfFormatado: args.cpfFormatado ?? null,
      nome: args.nome,
      fonte: f.id,
      fonteNome: f.nome,
      site: SITE_POR_FONTE[f.id] ?? null,
      status: f.status,
      alerta: f.alerta,
      identificado: f.observacao,
      achados,
      evidencia: f.evidencia ?? null,
      dataConsulta: args.dataConsulta,
      consultadoEm: f.consultadoEm ?? null,
      analiseId: args.analiseId ?? null,
      atualizadoEm: ts,
    };
    if (idx >= 0) {
      const registro: RegistroClienteAnalise = { ...db.registros[idx]!, ...base };
      db.registros[idx] = registro;
      saidas.push(registro);
    } else {
      const registro: RegistroClienteAnalise = {
        id: crypto.randomUUID(),
        cadastradoEm: ts,
        ...base,
      };
      db.registros.push(registro);
      saidas.push(registro);
    }
  }

  saveClienteAnaliseDb(db);
  return saidas;
}

export interface ListarClienteAnaliseFiltro {
  cpf?: string;
  clienteId?: string;
  /** Só linhas com alerta. */
  comAlerta?: boolean;
}

export function listarClienteAnalise(
  filtro: ListarClienteAnaliseFiltro = {},
): RegistroClienteAnalise[] {
  const db = loadClienteAnaliseDb();
  const cpfKey = filtro.cpf ? normCpf(filtro.cpf) : null;
  return db.registros
    .filter((r) => {
      if (cpfKey && normCpf(r.cpf) !== cpfKey) return false;
      if (filtro.clienteId && r.clienteId !== filtro.clienteId) return false;
      if (filtro.comAlerta && !r.alerta) return false;
      return true;
    })
    .sort((a, b) => (a.dataConsulta < b.dataConsulta ? 1 : -1));
}
