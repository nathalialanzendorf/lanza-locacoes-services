import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { jsonDocumentExists, loadJsonDocument, loadJsonDocumentForApi, saveJsonDocument, saveJsonDocumentAsync } from "@lanza/db";
import { compactPlaca, formatPlacaHyphen, placasIguais } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";

export const DB_LOCACOES = path.join(REPO_ROOT, "database", "locacoes.json");
const DB_VEICULOS = path.join(REPO_ROOT, "database", "veiculos.json");
const DB_CLIENTES = path.join(REPO_ROOT, "database", "clientes.json");

export type SituacaoLocacao = "reserva" | "manutencao" | "locado";
export type TipoLocacao = "diaria" | "semanal" | "mensal";

export type LocacaoRegistro = {
  id: string;
  veiculoId: string | null;
  placa: string;
  clienteId: string | null;
  condutorNome: string | null;
  contratoId: string | null;
  situacao: SituacaoLocacao;
  inicio: string;
  fim: string | null;
  tipoLocacao: TipoLocacao | null;
  valorCobrado: number | null;
  valorPago: number | null;
  substituiVeiculoId: string | null;
  substituiPlaca: string | null;
  observacao: string | null;
  cadastradoEm: string;
  atualizadoEm: string;
};

type LocacoesDb = {
  descricao?: string;
  atualizadoEm?: string;
  schemaLocacao?: Record<string, string>;
  locacoes: LocacaoRegistro[];
};

const DEFAULT_DESCRICAO =
  "Linha do tempo de uso de cada veículo: períodos de locação, reserva e manutenção. id = uuid. veiculoId -> veiculos.json; clienteId -> clientes.json; contratoId -> contratos.json. Consumido por relatorio-prestacao-contas (ganho de locado, desconto de diárias em manutenção, pagamento de diárias de veículo reserva e taxa de controle semanal).";

const DEFAULT_SCHEMA: Record<string, string> = {
  id: "uuid",
  veiculoId: "uuid -> veiculos.json (null se placa não cadastrada)",
  placa: "Placa do veículo (ABC-1D23)",
  clienteId: "uuid -> clientes.json (null quando reserva/manutenção sem cliente)",
  condutorNome: "Nome do cliente/locatário (null se sem cliente)",
  contratoId: "uuid -> contratos.json (opcional; vincula ao contrato de locação)",
  situacao: "reserva | manutencao | locado",
  inicio: "DD/MM/AAAA — início do período",
  fim: "DD/MM/AAAA — término do período (null = em aberto/vigente)",
  tipoLocacao:
    "diaria | semanal | mensal (locado ou reserva; null em manutenção). Reserva costuma ser diaria",
  valorCobrado:
    "número — valor POR UNIDADE do tipoLocacao cobrado do cliente (ex.: semanal 500). null em manutenção ou se não cobrado",
  valorPago:
    "número — valor POR UNIDADE repassado ao parceiro/dono (ex.: 350; na reserva é a diária do veículo substituto). A diferença valorCobrado - valorPago é a taxa de controle da locadora (tipicamente R$ 150/semana em veículo de parceiro). null em manutenção ou frota própria",
  substituiVeiculoId:
    "uuid -> veiculos.json — veículo que este está substituindo (quando situacao = reserva por manutenção). null caso contrário",
  substituiPlaca:
    "Placa do veículo substituído (espelho de substituiVeiculoId). null caso contrário",
  observacao: "Texto livre (motivo da manutenção, detalhe da reserva, etc.)",
  cadastradoEm: "ISO 8601",
  atualizadoEm: "ISO 8601",
};

/** Taxa de controle padrão da locadora por semana em veículo de parceiro. */
export const TAXA_CONTROLE_SEMANAL = 150;

function nowIso(): string {
  return new Date().toISOString();
}

function parseValor(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).replace(/R\$\s*/i, "").trim();
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

type VeiculoJson = { id?: string; placa: string };
type ClienteJson = { id?: string; nome?: string; cpf?: string };

function loadVeiculos(): VeiculoJson[] {
  if (!fs.existsSync(DB_VEICULOS)) return [];
  return (JSON.parse(fs.readFileSync(DB_VEICULOS, "utf8")) as { veiculos?: VeiculoJson[] })
    .veiculos ?? [];
}

function loadClientes(): ClienteJson[] {
  if (!fs.existsSync(DB_CLIENTES)) return [];
  return (JSON.parse(fs.readFileSync(DB_CLIENTES, "utf8")) as { clientes?: ClienteJson[] })
    .clientes ?? [];
}

/** Resolve placa -> { veiculoId, placa formatada }. */
export function resolveVeiculo(placa: string): { id: string | null; placa: string } {
  const key = compactPlaca(placa);
  const v = loadVeiculos().find((x) => compactPlaca(x.placa) === key);
  return { id: v?.id ?? null, placa: v?.placa ?? formatPlacaHyphen(placa) };
}

function normCpf(cpf: string): string {
  return String(cpf).replace(/\D/g, "");
}

function normNome(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve condutor por id, CPF ou nome -> { clienteId, condutorNome }. */
export function resolveCondutor(
  ref: string | null | undefined,
): { id: string | null; nome: string | null } {
  if (!ref) return { id: null, nome: null };
  const r = String(ref).trim();
  const clientes = loadClientes();

  const byId = clientes.find((c) => c.id === r);
  if (byId) return { id: byId.id ?? null, nome: byId.nome ?? null };

  const cpfKey = normCpf(r);
  if (cpfKey.length === 11) {
    const byCpf = clientes.find((c) => c.cpf && normCpf(c.cpf) === cpfKey);
    if (byCpf) return { id: byCpf.id ?? null, nome: byCpf.nome ?? null };
  }

  const nomeKey = normNome(r);
  const byNome = clientes.filter((c) => {
    const cn = normNome(c.nome ?? "");
    return cn === nomeKey || cn.includes(nomeKey) || nomeKey.includes(cn);
  });
  if (byNome.length === 1) return { id: byNome[0]!.id ?? null, nome: byNome[0]!.nome ?? null };

  // Não casou em clientes.json: guarda o nome informado, sem vínculo.
  return { id: null, nome: r };
}

export function loadLocacoesDb(): LocacoesDb {
  if (!jsonDocumentExists(DB_LOCACOES)) {
    return {
      descricao: DEFAULT_DESCRICAO,
      atualizadoEm: new Date().toISOString().slice(0, 10),
      schemaLocacao: DEFAULT_SCHEMA,
      locacoes: [],
    };
  }
  const db = loadJsonDocument<LocacoesDb>(DB_LOCACOES);
  if (!db.schemaLocacao) db.schemaLocacao = DEFAULT_SCHEMA;
  if (!Array.isArray(db.locacoes)) db.locacoes = [];
  return db;
}

export async function loadLocacoesDbAsync(): Promise<LocacoesDb> {
  const db = await loadJsonDocumentForApi<LocacoesDb>(DB_LOCACOES, {
    descricao: DEFAULT_DESCRICAO,
    atualizadoEm: new Date().toISOString().slice(0, 10),
    schemaLocacao: DEFAULT_SCHEMA,
    locacoes: [],
  });
  if (!db.schemaLocacao) db.schemaLocacao = DEFAULT_SCHEMA;
  if (!Array.isArray(db.locacoes)) db.locacoes = [];
  return db;
}

export function saveLocacoesDb(db: LocacoesDb): void {
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schemaLocacao = DEFAULT_SCHEMA;
  saveJsonDocument(DB_LOCACOES, db, { trailingNewline: true });
}

export async function saveLocacoesDbAsync(db: LocacoesDb): Promise<void> {
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  if (!db.descricao) db.descricao = DEFAULT_DESCRICAO;
  db.schemaLocacao = DEFAULT_SCHEMA;
  await saveJsonDocumentAsync(DB_LOCACOES, db as Record<string, unknown>, { trailingNewline: true });
}

export type LocacaoInput = {
  /** id para atualizar um registro existente (senão cria novo). */
  id?: string;
  placa: string;
  situacao: SituacaoLocacao;
  inicio: string;
  fim?: string | null;
  /** uuid, CPF ou nome do cliente (legado: condutor) */
  clienteId?: string | null;
  /** @deprecated use clienteId */
  condutor?: string | null;
  contratoId?: string | null;
  tipoLocacao?: TipoLocacao | null;
  valorCobrado?: number | string | null;
  valorPago?: number | string | null;
  substituiPlaca?: string | null;
  observacao?: string | null;
};

const SITUACOES: ReadonlySet<string> = new Set(["reserva", "manutencao", "locado"]);
const TIPOS: ReadonlySet<string> = new Set(["diaria", "semanal", "mensal"]);

function validar(input: LocacaoInput): void {
  if (!input.placa) throw new Error("placa é obrigatória");
  if (!SITUACOES.has(input.situacao)) {
    throw new Error(`situacao inválida: ${input.situacao} (use reserva|manutencao|locado)`);
  }
  if (!input.inicio) throw new Error("inicio (DD/MM/AAAA) é obrigatório");
  if (input.tipoLocacao && !TIPOS.has(input.tipoLocacao)) {
    throw new Error(`tipoLocacao inválido: ${input.tipoLocacao} (use diaria|semanal|mensal)`);
  }
  if (input.situacao === "locado" && !input.tipoLocacao) {
    throw new Error("situacao 'locado' exige tipoLocacao (diaria|semanal|mensal)");
  }
}

export type GravarLocacaoResult = {
  registro: LocacaoRegistro;
  acao: "novo" | "atualizado";
  aviso: string | null;
};

function applyGravarLocacao(db: LocacoesDb, input: LocacaoInput): GravarLocacaoResult {
  validar(input);
  const ts = nowIso();

  const { id: veiculoId, placa } = resolveVeiculo(input.placa);
  const refCliente = input.clienteId ?? input.condutor;
  const condutor = resolveCondutor(refCliente);
  const sub = input.substituiPlaca ? resolveVeiculo(input.substituiPlaca) : null;
  const comValores = input.situacao !== "manutencao";

  const avisos: string[] = [];
  if (!veiculoId) avisos.push("placa não cadastrada em veiculos.json");
  if (refCliente && !condutor.id) {
    avisos.push("cliente não encontrado em clientes.json (gravado só pelo nome)");
  }

  const base: Omit<LocacaoRegistro, "id" | "cadastradoEm"> = {
    veiculoId,
    placa,
    clienteId: condutor.id,
    condutorNome: condutor.nome,
    contratoId: input.contratoId?.trim() || null,
    situacao: input.situacao,
    inicio: input.inicio.trim(),
    fim: input.fim?.trim() || null,
    tipoLocacao: comValores ? (input.tipoLocacao ?? null) : null,
    valorCobrado: comValores ? parseValor(input.valorCobrado) : null,
    valorPago: comValores ? parseValor(input.valorPago) : null,
    substituiVeiculoId: sub?.id ?? null,
    substituiPlaca: sub?.placa ?? null,
    observacao: input.observacao?.trim() || null,
    atualizadoEm: ts,
  };

  if (input.id) {
    const idx = db.locacoes.findIndex((l) => l.id === input.id);
    if (idx < 0) throw new Error(`Locação não encontrada: ${input.id}`);
    const existing = db.locacoes[idx]!;
    const registro: LocacaoRegistro = { ...existing, ...base };
    db.locacoes[idx] = registro;
    return { registro, acao: "atualizado", aviso: avisos.join("; ") || null };
  }

  const registro: LocacaoRegistro = {
    id: crypto.randomUUID(),
    cadastradoEm: ts,
    ...base,
  };
  db.locacoes.push(registro);
  return { registro, acao: "novo", aviso: avisos.join("; ") || null };
}

/** Cria ou atualiza (por id) um registro de locação/reserva/manutenção. */
export function gravarLocacao(input: LocacaoInput): GravarLocacaoResult {
  const db = loadLocacoesDb();
  const result = applyGravarLocacao(db, input);
  saveLocacoesDb(db);
  return result;
}

export async function gravarLocacaoAsync(input: LocacaoInput): Promise<GravarLocacaoResult> {
  const db = await loadLocacoesDbAsync();
  const result = applyGravarLocacao(db, input);
  await saveLocacoesDbAsync(db);
  return result;
}

export function excluirLocacao(id: string): LocacaoRegistro | null {
  const db = loadLocacoesDb();
  const idx = db.locacoes.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const [removido] = db.locacoes.splice(idx, 1);
  saveLocacoesDb(db);
  return removido ?? null;
}

export async function excluirLocacaoAsync(id: string): Promise<LocacaoRegistro | null> {
  const db = await loadLocacoesDbAsync();
  const idx = db.locacoes.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const [removido] = db.locacoes.splice(idx, 1);
  await saveLocacoesDbAsync(db);
  return removido ?? null;
}

export type ListarLocacoesFiltro = {
  placa?: string;
  situacao?: SituacaoLocacao;
  clienteId?: string;
  /** Período inclusivo — locações que intersectam o intervalo (início/fim da movimentação). */
  dataInicial?: string;
  dataFinal?: string;
  /** Inclui só registros vigentes/abertos (sem fim ou período que cobre hoje). */
  abertas?: boolean;
};

function locacaoIntersectaPeriodo(
  l: LocacaoRegistro,
  periodo: Pick<ListarLocacoesFiltro, "dataInicial" | "dataFinal">,
): boolean {
  if (!periodo.dataInicial?.trim() && !periodo.dataFinal?.trim()) return true;
  const locIni = parseBrDayStart(l.inicio);
  if (!locIni) return false;
  const locFim = l.fim ? parseBrDayEnd(l.fim) : null;
  const filtroIni = periodo.dataInicial?.trim() ? parseBrDayStart(periodo.dataInicial) : null;
  const filtroFim = periodo.dataFinal?.trim() ? parseBrDayEnd(periodo.dataFinal) : null;
  if (filtroFim && locIni > filtroFim) return false;
  if (filtroIni && locFim && locFim < filtroIni) return false;
  return true;
}

export function listarLocacoes(filtro: ListarLocacoesFiltro = {}): LocacaoRegistro[] {
  return listarLocacoesFromDb(loadLocacoesDb().locacoes, filtro);
}

export async function listarLocacoesAsync(filtro: ListarLocacoesFiltro = {}): Promise<LocacaoRegistro[]> {
  const db = await loadLocacoesDbAsync();
  return listarLocacoesFromDb(db.locacoes, filtro);
}

function listarLocacoesFromDb(
  locacoes: LocacaoRegistro[],
  filtro: ListarLocacoesFiltro,
): LocacaoRegistro[] {
  return locacoes
    .filter((l) => {
      if (filtro.placa && !placasIguais(l.placa, filtro.placa)) return false;
      if (filtro.clienteId?.trim() && l.clienteId !== filtro.clienteId.trim()) return false;
      if (filtro.situacao && l.situacao !== filtro.situacao) return false;
      if (filtro.abertas && !locacaoEmAberto(l)) return false;
      if (!locacaoIntersectaPeriodo(l, filtro)) return false;
      return true;
    })
    .sort((a, b) => dataNum(a.inicio) - dataNum(b.inicio));
}

/** Início do dia civil (DD/MM/AAAA). */
function parseBrDayStart(s: string | null | undefined): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Fim do dia civil (DD/MM/AAAA). */
function parseBrDayEnd(s: string | null | undefined): Date | null {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59, 999);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Período de locação/reserva/manutenção cobre a data/hora informada (inclusivo). */
export function locacaoCobreData(l: LocacaoRegistro, data: Date): boolean {
  const ini = parseBrDayStart(l.inicio);
  if (!ini) return false;
  const fim = l.fim ? parseBrDayEnd(l.fim) : null;
  return data >= ini && (fim === null || data <= fim);
}

/** Vigente/em aberto: sem data fim ou período que ainda cobre a referência (padrão: hoje). */
export function locacaoEmAberto(l: LocacaoRegistro, ref: Date = new Date()): boolean {
  if (!String(l.fim ?? "").trim()) return true;
  return locacaoCobreData(l, ref);
}

/**
 * Reserva substituta vigente na data: veículo reserva com `substituiPlaca` preenchida.
 * Usado por sync-infracoes/sync-pedagios para vincular débitos do carro reserva
 * ao contrato do veículo principal em manutenção.
 */
export function findReservaSubstitutaNaData(
  placaReserva: string,
  data: Date,
): LocacaoRegistro | null {
  const db = loadLocacoesDb();
  const matches = db.locacoes.filter(
    (l) =>
      placasIguais(l.placa, placaReserva) &&
      l.situacao === "reserva" &&
      Boolean(l.substituiPlaca?.trim()) &&
      locacaoCobreData(l, data),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => dataNum(b.inicio) - dataNum(a.inicio));
  return matches[0] ?? null;
}

/** Manutenção vigente na data (veículo principal parado). */
export function findManutencaoNaData(placa: string, data: Date): LocacaoRegistro | null {
  const db = loadLocacoesDb();
  const matches = db.locacoes.filter(
    (l) =>
      placasIguais(l.placa, placa) &&
      l.situacao === "manutencao" &&
      locacaoCobreData(l, data),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => dataNum(b.inicio) - dataNum(a.inicio));
  return matches[0] ?? null;
}

/** DD/MM/AAAA -> AAAAMMDD (0 se não parsear). */
function dataNum(d: string | null | undefined): number {
  const m = String(d ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}

// ───────────────────────── Sugestão p/ prestação de contas ─────────────────

function parseBr(d: string | null | undefined): Date | null {
  const m = String(d ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const MS_DIA = 86_400_000;

/** Dias inclusivos entre a e b (a..b conta os dois extremos). 0 se b < a. */
function diasInclusivos(a: Date, b: Date): number {
  const n = Math.floor((b.getTime() - a.getTime()) / MS_DIA) + 1;
  return n > 0 ? n : 0;
}

/** Dias do período [pi,pf] cobertos por um segmento [si, sf||pf]. */
function diasSobrepostos(
  si: Date | null,
  sf: Date | null,
  pi: Date,
  pf: Date,
): number {
  if (!si) return 0;
  const ini = si > pi ? si : pi;
  const fim = sf && sf < pf ? sf : pf;
  return diasInclusivos(ini, fim);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dias por unidade do tipo (mensal usa os dias do mês da competência). */
function diasPorUnidade(tipo: TipoLocacao | null, pi: Date): number {
  if (tipo === "diaria") return 1;
  if (tipo === "semanal") return 7;
  if (tipo === "mensal") return new Date(pi.getFullYear(), pi.getMonth() + 1, 0).getDate();
  return 1;
}

const UNIDADE_WORD: Record<TipoLocacao, { sing: string; plur: string; rate: string }> = {
  diaria: { sing: "diária", plur: "diárias", rate: "/dia" },
  semanal: { sing: "semana", plur: "semanas", rate: "/sem" },
  mensal: { sing: "mês", plur: "meses", rate: "/mês" },
};

function fmtDM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Recorte do segmento [si, sf||pf] dentro do período [pi, pf]. */
function recorte(
  si: Date | null,
  sf: Date | null,
  pi: Date,
  pf: Date,
): { ini: Date; fim: Date; dias: number } | null {
  if (!si) return null;
  const ini = si > pi ? si : pi;
  const fim = sf && sf < pf ? sf : pf;
  const dias = diasInclusivos(ini, fim);
  return dias > 0 ? { ini, fim, dias } : null;
}

/** "DD/MM até DD/MM" (ou só "DD/MM" quando início = fim). */
function fmtPeriodoDM(ini: Date, fim: Date): string {
  const a = fmtDM(ini);
  const b = fmtDM(fim);
  return a === b ? a : `${a} até ${b}`;
}

function brlNum(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQtd(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

/** "3 semanas", "1 semana", "1 diária" conforme tipo/quantidade. */
function palavraUnidade(qtd: number, tipo: TipoLocacao): string {
  const w = UNIDADE_WORD[tipo];
  return `${fmtQtd(qtd)} ${qtd === 1 ? w.sing : w.plur}`;
}

export type SegmentoSugestao = {
  id: string;
  situacao: SituacaoLocacao;
  inicio: string;
  fim: string | null;
  diasNoPeriodo: number;
  tipoLocacao: TipoLocacao | null;
  valorCobrado: number | null;
  valorPago: number | null;
  condutorNome: string | null;
  substituiPlaca: string | null;
};

export type ValorItem = { descricao: string; valor: number };

export type SugestaoVeiculo = {
  placa: string;
  veiculoId: string | null;
  /** Linhas prontas para o "Ganho" do relatório (locado + reserva), por valorPago. */
  ganhoItens: ValorItem[];
  /** Linhas prontas para "Desconto manutenção" (uma por registro parado). */
  manutencaoItens: ValorItem[];
  locado: {
    dias: number;
    unidades: number;
    ganhoCobrado: number;
    repasseParceiro: number;
    taxaControle: number;
  };
  manutencao: {
    dias: number;
    diariaCobradaEquivalente: number | null;
    descontoCobradoSugerido: number | null;
    descontoPagoSugerido: number | null;
  };
  reserva: {
    dias: number;
    totalPagar: number;
    substituiPlacas: string[];
  };
  segmentos: SegmentoSugestao[];
};

export type SugestaoLocacoes = {
  competencia: string;
  periodo: { inicio: string; fim: string };
  veiculos: SugestaoVeiculo[];
};

export type SugerirOpts = {
  competencia: string;
  inicio?: string;
  fim?: string;
  placa?: string;
};

/**
 * Agrega `locacoes.json` num período para SUGERIR à prestação de contas:
 * ganho/repasse/taxa dos segmentos `locado`, dias e desconto de `manutencao`,
 * e diárias a pagar de `reserva`. Não grava nada (só leitura).
 */
export function sugerirLocacoes(opts: SugerirOpts): SugestaoLocacoes {
  const comp = opts.competencia.trim();
  const m = comp.match(/^(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`competência inválida: ${comp} (use MM/AAAA)`);
  const mm = Number(m[1]);
  const aaaa = Number(m[2]);
  const inicioStr = opts.inicio?.trim() || `01/${m[1]}/${m[2]}`;
  const ultimoDia = new Date(aaaa, mm, 0).getDate();
  const fimStr =
    opts.fim?.trim() || `${String(ultimoDia).padStart(2, "0")}/${m[1]}/${m[2]}`;
  const pi = parseBr(inicioStr)!;
  const pf = parseBr(fimStr)!;

  const db = loadLocacoesDb();
  const filtradas = opts.placa
    ? db.locacoes.filter((l) => placasIguais(l.placa, opts.placa!))
    : db.locacoes;

  const porPlaca = new Map<string, LocacaoRegistro[]>();
  for (const l of filtradas) {
    const dias = diasSobrepostos(parseBr(l.inicio), parseBr(l.fim), pi, pf);
    if (dias <= 0) continue;
    const key = compactPlaca(l.placa);
    const arr = porPlaca.get(key) ?? [];
    arr.push(l);
    porPlaca.set(key, arr);
  }

  const veiculos: SugestaoVeiculo[] = [];
  for (const [, regs] of porPlaca) {
    regs.sort((a, b) => dataNum(a.inicio) - dataNum(b.inicio));
    const placa = regs[0]!.placa;
    const veiculoId = regs[0]!.veiculoId;

    const segmentos: SegmentoSugestao[] = [];
    const ganhoItens: ValorItem[] = [];
    // Manutenção é valorizada com a diária do locado; guarda os recortes e
    // calcula o valor depois de conhecer a diária do veículo.
    const manutRaw: { ini: Date; fim: Date; dias: number }[] = [];
    let locDias = 0;
    let unidades = 0;
    let ganhoCobrado = 0;
    let repasse = 0;
    let manutDias = 0;
    let reservaDias = 0;
    let reservaTotal = 0;
    const substituiPlacas = new Set<string>();

    // Diária-equivalente do veículo (p/ valorizar manutenção): do segmento
    // `locado` mais recente. Mantém-se o valor BRUTO (sem arredondar) p/ não
    // acumular erro ao multiplicar pelos dias.
    let diariaCobr: number | null = null;
    let diariaPago: number | null = null;
    let ultimoLocadoNum = -1;

    for (const l of regs) {
      const rec = recorte(parseBr(l.inicio), parseBr(l.fim), pi, pf);
      const dias = rec?.dias ?? 0;
      segmentos.push({
        id: l.id,
        situacao: l.situacao,
        inicio: l.inicio,
        fim: l.fim,
        diasNoPeriodo: dias,
        tipoLocacao: l.tipoLocacao,
        valorCobrado: l.valorCobrado,
        valorPago: l.valorPago,
        condutorNome: l.condutorNome,
        substituiPlaca: l.substituiPlaca,
      });
      if (!rec) continue;

      if (l.situacao === "locado") {
        const tipo = l.tipoLocacao ?? "semanal";
        const dpu = diasPorUnidade(tipo, pi);
        const u = dias / dpu;
        locDias += dias;
        unidades += u;
        ganhoCobrado += (l.valorCobrado ?? 0) * u;
        repasse += (l.valorPago ?? 0) * u;
        const n = dataNum(l.inicio);
        if (n >= ultimoLocadoNum) {
          ultimoLocadoNum = n;
          diariaCobr = l.valorCobrado != null ? l.valorCobrado / dpu : null;
          diariaPago = l.valorPago != null ? l.valorPago / dpu : null;
        }
        ganhoItens.push({
          descricao: `${palavraUnidade(u, tipo)} locado ${fmtPeriodoDM(rec.ini, rec.fim)} (R$ ${brlNum(l.valorPago ?? 0)}${UNIDADE_WORD[tipo].rate})`,
          valor: round2((l.valorPago ?? 0) * u),
        });
      } else if (l.situacao === "manutencao") {
        manutDias += dias;
        manutRaw.push(rec);
      } else if (l.situacao === "reserva") {
        const tipo = l.tipoLocacao ?? "diaria";
        const dpu = diasPorUnidade(tipo, pi);
        const u = dias / dpu;
        const v = round2((l.valorPago ?? 0) * u);
        reservaDias += dias;
        reservaTotal += v;
        if (l.substituiPlaca) substituiPlacas.add(l.substituiPlaca);
        ganhoItens.push({
          descricao: `${palavraUnidade(u, tipo)} reserva ${fmtPeriodoDM(rec.ini, rec.fim)} (R$ ${brlNum(v)})`,
          valor: v,
        });
      }
    }

    // Uma linha de desconto por registro de manutenção (não agregado).
    const manutencaoItens: ValorItem[] = manutRaw.map((r) => {
      const v = diariaPago != null ? round2(diariaPago * r.dias) : 0;
      return {
        descricao: `${palavraUnidade(r.dias, "diaria")} parado ${fmtPeriodoDM(r.ini, r.fim)} (R$ ${brlNum(v)})`,
        valor: v,
      };
    });

    veiculos.push({
      placa,
      veiculoId,
      ganhoItens,
      manutencaoItens,
      locado: {
        dias: locDias,
        unidades: round2(unidades),
        ganhoCobrado: round2(ganhoCobrado),
        repasseParceiro: round2(repasse),
        taxaControle: round2(ganhoCobrado - repasse),
      },
      manutencao: {
        dias: manutDias,
        diariaCobradaEquivalente: diariaCobr != null ? round2(diariaCobr) : null,
        descontoCobradoSugerido:
          diariaCobr != null && manutDias > 0 ? round2(diariaCobr * manutDias) : null,
        descontoPagoSugerido:
          diariaPago != null && manutDias > 0 ? round2(diariaPago * manutDias) : null,
      },
      reserva: {
        dias: reservaDias,
        totalPagar: round2(reservaTotal),
        substituiPlacas: [...substituiPlacas],
      },
      segmentos,
    });
  }

  veiculos.sort((a, b) => a.placa.localeCompare(b.placa));
  return {
    competencia: comp,
    periodo: { inicio: inicioStr, fim: fimStr },
    veiculos,
  };
}
