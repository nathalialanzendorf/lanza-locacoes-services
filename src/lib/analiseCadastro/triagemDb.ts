/**
 * Database do histórico de análises de cadastro de locatário
 * (`database/analise-cadastro.json`).
 *
 * Cada execução da skill `relatorio-analise-cadastro` grava aqui um registro com
 * os dados do locatário, a base legal (LGPD), o resultado por fonte e os caminhos
 * dos relatórios gerados. Mantém histórico (uma análise por dia, por CPF).
 *
 * Idempotência: chave natural = `cpf` + `dataConsulta` (AAAA-MM-DD). Rodar de
 * novo no mesmo dia ATUALIZA o registro (espelha o arquivo de relatório, que
 * também é por dia). Dias diferentes acumulam histórico.
 */
import crypto from "node:crypto";
import path from "node:path";

import {
  jsonDocumentExists,
  loadJsonDocument,
  loadJsonDocumentForApi,
  saveJsonDocument,
  saveJsonDocumentAsync,
} from "@lanza/db";
import { loadClientesDb, loadClientesDbAsync, type ClienteRegistro } from "../clientesDb.js";
import { REPO_ROOT } from "../repoRoot.js";
import type { DadosLocatario, ResultadoFonte, StatusFonte } from "./tipos.js";
import type { DadosLgpd, RelatorioTriagem } from "./relatorio.js";

export const DB_TRIAGEM = path.join(REPO_ROOT, "database", "analise-cadastro.json");

/** Resumo de uma fonte, sem os achados detalhados (que ficam no relatório). */
export interface FonteResumo {
  id: string;
  nome: string;
  status: StatusFonte;
  alerta: boolean;
  observacao: string;
  qtdAchados: number;
  evidencia: string | null;
  consultadoEm: string;
}

export interface TriagemRegistro {
  id: string;
  clienteId: string | null;
  cpf: string;
  cpfFormatado: string;
  nome: string;
  nascimento: string;
  dataConsulta: string;
  lgpd: DadosLgpd;
  alertaGeral: boolean;
  /** Decisão do operador: passou na análise? true | false | null (pendente). */
  aprovado: boolean | null;
  resumo: string;
  fontes: FonteResumo[];
  relatorioJson: string | null;
  relatorioTxt: string | null;
  cadastradoEm: string;
  atualizadoEm: string;
}

interface TriagemDb {
  descricao?: string;
  atualizadoEm?: string;
  schemaTriagem?: Record<string, string>;
  triagens: TriagemRegistro[];
}

const DEFAULT_DESCRICAO =
  "Histórico de análises de cadastro de locatário (antecedentes criminais / processos). id = uuid; chave natural cpf + dataConsulta (1 por dia). clienteId -> clientes.json. Detalhe completo (achados) fica nos relatórios em relatorios/analise-cadastro/. Gerado pela skill relatorio-analise-cadastro; NÃO contém dados de terceiros sem base legal registrada (LGPD).";

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid",
  clienteId: "uuid -> clientes.json (null se o CPF não está cadastrado)",
  cpf: "CPF só dígitos (11)",
  cpfFormatado: "000.000.000-00",
  nome: "Nome civil consultado",
  nascimento: "DD/MM/AAAA",
  dataConsulta: "AAAA-MM-DD — data da análise (chave natural com cpf)",
  lgpd: "{ baseLegal, titularConsentimento, solicitante, finalidade }",
  alertaGeral: "true se alguma fonte sinalizou risco (sinal automático)",
  aprovado: "decisão do operador: passou na análise? true | false | null (pendente)",
  resumo: "Conclusão automática (texto)",
  fontes:
    "[] resumo por fonte: { id, nome, status, alerta, observacao, qtdAchados, evidencia, consultadoEm }",
  relatorioJson: "Caminho (relativo ao repo) do relatório .json completo (sidecar do canvas)",
  relatorioTxt: "Caminho (relativo ao repo) do documento .txt",
  cadastradoEm: "ISO 8601",
  atualizadoEm: "ISO 8601",
};

const hojeIso = (): string => new Date().toISOString().slice(0, 10);
const nowIso = (): string => new Date().toISOString();

function normCpf(cpf: string): string {
  return String(cpf ?? "").replace(/\D/g, "");
}

function emptyTriagemDb(): TriagemDb {
  return {
    descricao: DEFAULT_DESCRICAO,
    atualizadoEm: hojeIso(),
    schemaTriagem: DEFAULT_SCHEMA,
    triagens: [],
  };
}

function normalizeTriagemDb(db: TriagemDb): TriagemDb {
  if (!Array.isArray(db.triagens)) db.triagens = [];
  if (!db.schemaTriagem) db.schemaTriagem = DEFAULT_SCHEMA;
  return db;
}

/** Vincula a triagem a um cliente cadastrado, por CPF. */
function resolveClienteIdFromList(cpf: string, clientes: ClienteRegistro[]): string | null {
  const key = normCpf(cpf);
  const c = clientes.find((x) => x.cpf && normCpf(x.cpf) === key);
  return c?.id ?? null;
}

function resolveClienteId(cpf: string): string | null {
  return resolveClienteIdFromList(cpf, loadClientesDb().clientes);
}

export function loadTriagemDb(): TriagemDb {
  if (!jsonDocumentExists(DB_TRIAGEM)) return emptyTriagemDb();
  return normalizeTriagemDb(loadJsonDocument<TriagemDb>(DB_TRIAGEM));
}

export async function loadTriagemDbAsync(): Promise<TriagemDb> {
  const db = await loadJsonDocumentForApi<TriagemDb>(DB_TRIAGEM, emptyTriagemDb());
  return normalizeTriagemDb(db);
}

export function saveTriagemDb(db: TriagemDb): void {
  db.atualizadoEm = hojeIso();
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schemaTriagem = DEFAULT_SCHEMA;
  saveJsonDocument(DB_TRIAGEM, db, { mkdir: true, trailingNewline: true });
}

export async function saveTriagemDbAsync(db: TriagemDb): Promise<void> {
  db.atualizadoEm = hojeIso();
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schemaTriagem = DEFAULT_SCHEMA;
  await saveJsonDocumentAsync(DB_TRIAGEM, db as unknown as Record<string, unknown>, {
    mkdir: true,
    trailingNewline: true,
  });
}

function resumirFonte(f: ResultadoFonte): FonteResumo {
  return {
    id: f.id,
    nome: f.nome,
    status: f.status,
    alerta: f.alerta,
    observacao: f.observacao,
    qtdAchados: f.achados.length,
    evidencia: f.evidencia ?? null,
    consultadoEm: f.consultadoEm,
  };
}

export interface RegistrarResultado {
  registro: TriagemRegistro;
  acao: "novo" | "atualizado";
}

/**
 * Grava (ou atualiza, por cpf+dataConsulta) uma triagem na database.
 * Os caminhos dos relatórios são guardados como relativos ao repo.
 */
export function registrarTriagem(args: {
  locatario: DadosLocatario;
  relatorio: RelatorioTriagem;
  caminhoJson?: string | null;
  caminhoTxt?: string | null;
  /** Decisão do operador (passou na análise?); default null = pendente. */
  aprovado?: boolean | null;
}): RegistrarResultado {
  const { locatario, relatorio } = args;
  const db = loadTriagemDb();
  const ts = nowIso();
  const dataConsulta = (relatorio.geradoEm || ts).slice(0, 10);
  const cpf = normCpf(locatario.cpf);

  const relativo = (p?: string | null): string | null =>
    p ? path.relative(REPO_ROOT, p).replace(/\\/g, "/") : null;

  const base: Omit<TriagemRegistro, "id" | "cadastradoEm"> = {
    clienteId: resolveClienteId(cpf),
    cpf,
    cpfFormatado: locatario.cpfFormatado,
    nome: locatario.nome,
    nascimento: locatario.nascimento,
    dataConsulta,
    lgpd: relatorio.lgpd,
    alertaGeral: relatorio.alertaGeral,
    aprovado: args.aprovado ?? null,
    resumo: relatorio.resumo,
    fontes: relatorio.fontes.map(resumirFonte),
    relatorioJson: relativo(args.caminhoJson),
    relatorioTxt: relativo(args.caminhoTxt),
    atualizadoEm: ts,
  };

  const idx = db.triagens.findIndex(
    (t) => normCpf(t.cpf) === cpf && t.dataConsulta === dataConsulta,
  );
  if (idx >= 0) {
    const existente = db.triagens[idx]!;
    const registro: TriagemRegistro = { ...existente, ...base };
    // Re-rodar no mesmo dia sem decisão explícita preserva o `aprovado` anterior.
    if (args.aprovado === undefined) registro.aprovado = existente.aprovado ?? null;
    db.triagens[idx] = registro;
    saveTriagemDb(db);
    return { registro, acao: "atualizado" };
  }

  const registro: TriagemRegistro = {
    id: crypto.randomUUID(),
    cadastradoEm: ts,
    ...base,
  };
  db.triagens.push(registro);
  saveTriagemDb(db);
  return { registro, acao: "novo" };
}

export async function registrarTriagemAsync(args: {
  locatario: DadosLocatario;
  relatorio: RelatorioTriagem;
  caminhoJson?: string | null;
  caminhoTxt?: string | null;
  aprovado?: boolean | null;
}): Promise<RegistrarResultado> {
  const [db, clientesDb] = await Promise.all([loadTriagemDbAsync(), loadClientesDbAsync()]);
  const { locatario, relatorio } = args;
  const ts = nowIso();
  const dataConsulta = (relatorio.geradoEm || ts).slice(0, 10);
  const cpf = normCpf(locatario.cpf);

  const relativo = (p?: string | null): string | null =>
    p ? path.relative(REPO_ROOT, p).replace(/\\/g, "/") : null;

  const base: Omit<TriagemRegistro, "id" | "cadastradoEm"> = {
    clienteId: resolveClienteIdFromList(cpf, clientesDb.clientes),
    cpf,
    cpfFormatado: locatario.cpfFormatado,
    nome: locatario.nome,
    nascimento: locatario.nascimento,
    dataConsulta,
    lgpd: relatorio.lgpd,
    alertaGeral: relatorio.alertaGeral,
    aprovado: args.aprovado ?? null,
    resumo: relatorio.resumo,
    fontes: relatorio.fontes.map(resumirFonte),
    relatorioJson: relativo(args.caminhoJson),
    relatorioTxt: relativo(args.caminhoTxt),
    atualizadoEm: ts,
  };

  const idx = db.triagens.findIndex(
    (t) => normCpf(t.cpf) === cpf && t.dataConsulta === dataConsulta,
  );
  if (idx >= 0) {
    const existente = db.triagens[idx]!;
    const registro: TriagemRegistro = { ...existente, ...base };
    if (args.aprovado === undefined) registro.aprovado = existente.aprovado ?? null;
    db.triagens[idx] = registro;
    await saveTriagemDbAsync(db);
    return { registro, acao: "atualizado" };
  }

  const registro: TriagemRegistro = {
    id: crypto.randomUUID(),
    cadastradoEm: ts,
    ...base,
  };
  db.triagens.push(registro);
  await saveTriagemDbAsync(db);
  return { registro, acao: "novo" };
}

export interface ListarTriagemFiltro {
  cpf?: string;
  /** Só triagens com alerta. */
  comAlerta?: boolean;
}

export function listarTriagens(filtro: ListarTriagemFiltro = {}): TriagemRegistro[] {
  return filtrarTriagens(loadTriagemDb().triagens, filtro);
}

export async function listarTriagensAsync(
  filtro: ListarTriagemFiltro = {},
): Promise<TriagemRegistro[]> {
  const db = await loadTriagemDbAsync();
  return filtrarTriagens(db.triagens, filtro);
}

function filtrarTriagens(triagens: TriagemRegistro[], filtro: ListarTriagemFiltro): TriagemRegistro[] {
  const cpfKey = filtro.cpf ? normCpf(filtro.cpf) : null;
  return triagens
    .filter((t) => {
      if (cpfKey && normCpf(t.cpf) !== cpfKey) return false;
      if (filtro.comAlerta && !t.alertaGeral) return false;
      return true;
    })
    .sort((a, b) => (a.dataConsulta < b.dataConsulta ? 1 : -1));
}

/** Última análise de cadastro registrada para um CPF (a mais recente), ou null. */
export function ultimaTriagemPorCpf(cpf: string): TriagemRegistro | null {
  const lista = listarTriagens({ cpf });
  return lista[0] ?? null;
}
