import crypto from "node:crypto";
import path from "node:path";

import {
  jsonDocumentExists,
  loadJsonDocument,
  loadJsonDocumentForApi,
  saveJsonDocument,
  saveJsonDocumentAsync,
  getDbBackend,
  loadParceirosFromSql,
  loadVinculosFromSql,
  saveParceirosToSql,
  upsertParceiroRowToSql,
  deleteParceiroRowFromSql,
  saveVinculosToSql,
  exportJsonBackup,
} from "@lanza/db";

import { REPO_ROOT } from "../lib-imports.js";
import { HttpError } from "../http.js";

const DBP = path.join(REPO_ROOT, "database", "parceiros.json");
const DBL = path.join(REPO_ROOT, "database", "parceiro-veiculo.json");

export type Parceiro = { id: string; nome: string; ativo?: boolean };
export type VinculoParceiro = { id: string; veiculoId: string; parceiroId: string };

type ParceirosDb = {
  parceiros: Parceiro[];
  atualizadoEm?: string;
};

type VinculosDb = {
  vinculos: VinculoParceiro[];
  atualizadoEm?: string;
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isParceiroAtivo(p: Parceiro): boolean {
  return p.ativo !== false;
}

export type ListarParceirosOpts = {
  ativo?: boolean;
  /** Nome parcial para busca em tela (listagem — não usar em joins). */
  nome?: string;
  /** Nome ou id — resolvido na camada de listagem. */
  parceiroQuery?: string;
};

function filtrarParceirosPorBusca(items: Parceiro[], opts: ListarParceirosOpts): Parceiro[] {
  const query = opts.parceiroQuery?.trim() || opts.nome?.trim();
  if (!query) return items;

  const qLower = query.toLowerCase();
  const byId = items.find((p) => p.id.toLowerCase() === qLower);
  if (byId) return [byId];

  const nk = query.toLowerCase().replace(/\s+/g, " ").trim();
  return items.filter((p) => p.nome.toLowerCase().includes(nk));
}

function filtrarParceiros(items: Parceiro[], opts: ListarParceirosOpts): Parceiro[] {
  let out = filtrarParceirosPorBusca(items, opts);
  if (opts.ativo === true) return out.filter(isParceiroAtivo);
  if (opts.ativo === false) return out.filter((p) => !isParceiroAtivo(p));
  return out;
}

function loadParceirosDb(): ParceirosDb {
  if (!jsonDocumentExists(DBP)) return { parceiros: [] };
  const db = loadJsonDocument<ParceirosDb>(DBP);
  if (!Array.isArray(db.parceiros)) db.parceiros = [];
  return db;
}

function usePostgresStore(): boolean {
  return getDbBackend() !== "file";
}

async function loadParceirosDbAsync(): Promise<ParceirosDb> {
  if (usePostgresStore()) {
    return loadParceirosFromSql();
  }
  const db = await loadJsonDocumentForApi<ParceirosDb>(DBP, { parceiros: [] });
  if (!Array.isArray(db.parceiros)) db.parceiros = [];
  return db;
}

async function saveParceirosDbAsync(db: ParceirosDb): Promise<void> {
  db.atualizadoEm = hoje();
  if (usePostgresStore()) {
    await saveParceirosToSql(db);
    exportJsonBackup("parceiros.json", db);
    return;
  }
  await saveJsonDocumentAsync(DBP, db);
}

async function saveVinculosDbAsync(db: VinculosDb): Promise<void> {
  db.atualizadoEm = hoje();
  if (usePostgresStore()) {
    await saveVinculosToSql(db);
    exportJsonBackup("parceiro-veiculo.json", db);
    return;
  }
  await saveJsonDocumentAsync(DBL, db);
}

function saveParceirosDb(db: ParceirosDb): void {
  db.atualizadoEm = hoje();
  saveJsonDocument(DBP, db);
}

function loadVinculosDb(): VinculosDb {
  if (!jsonDocumentExists(DBL)) return { vinculos: [] };
  const db = loadJsonDocument<VinculosDb>(DBL);
  if (!Array.isArray(db.vinculos)) db.vinculos = [];
  return db;
}

async function loadVinculosDbAsync(): Promise<VinculosDb> {
  if (usePostgresStore()) {
    return loadVinculosFromSql();
  }
  const db = await loadJsonDocumentForApi<VinculosDb>(DBL, { vinculos: [] });
  if (!Array.isArray(db.vinculos)) db.vinculos = [];
  return db;
}

function saveVinculosDb(db: VinculosDb): void {
  db.atualizadoEm = hoje();
  saveJsonDocument(DBL, db);
}

export function listarParceiros(opts: ListarParceirosOpts = {}): { total: number; items: Parceiro[] } {
  const items = filtrarParceiros(loadParceirosDb().parceiros, opts);
  return { total: items.length, items };
}

export async function listarParceirosAsync(
  opts: ListarParceirosOpts = {},
): Promise<{ total: number; items: Parceiro[] }> {
  const items = filtrarParceiros((await loadParceirosDbAsync()).parceiros, opts);
  return { total: items.length, items };
}

export function obterParceiro(idOuNome: string): Parceiro | null {
  const db = loadParceirosDb();
  const key = idOuNome.trim();
  return (
    db.parceiros.find((p) => p.id === key) ??
    db.parceiros.find((p) => p.nome.toLowerCase() === key.toLowerCase()) ??
    null
  );
}

export async function obterParceiroAsync(idOuNome: string): Promise<Parceiro | null> {
  const db = await loadParceirosDbAsync();
  const key = idOuNome.trim();
  return (
    db.parceiros.find((p) => p.id === key) ??
    db.parceiros.find((p) => p.nome.toLowerCase() === key.toLowerCase()) ??
    null
  );
}

export async function criarParceiroAsync(nome: string): Promise<Parceiro> {
  const n = nome.trim();
  if (!n) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const existente = await obterParceiroAsync(n);
  if (existente) return existente;

  const parceiro: Parceiro = { id: crypto.randomUUID(), nome: n, ativo: true };
  if (usePostgresStore()) {
    const saved = await upsertParceiroRowToSql(parceiro);
    const check = await loadParceirosFromSql();
    if (!check.parceiros.some((p) => p.id === saved.id)) {
      throw new HttpError(500, "Parceiro gravado mas não encontrado ao reler o banco de dados");
    }
    return saved;
  }

  const db = await loadParceirosDbAsync();
  db.parceiros.push(parceiro);
  await saveParceirosDbAsync(db);
  return parceiro;
}

export function criarParceiro(nome: string): Parceiro {
  const n = nome.trim();
  if (!n) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const db = loadParceirosDb();
  const existente = db.parceiros.find((p) => p.nome.toLowerCase() === n.toLowerCase());
  if (existente) return existente;
  const parceiro: Parceiro = { id: crypto.randomUUID(), nome: n };
  db.parceiros.push(parceiro);
  saveParceirosDb(db);
  return parceiro;
}

export type AtualizarParceiroPatch = {
  nome?: string;
  ativo?: boolean;
};

export async function atualizarParceiroAsync(id: string, patch: AtualizarParceiroPatch): Promise<Parceiro> {
  const db = await loadParceirosDbAsync();
  const idx = db.parceiros.findIndex((p) => p.id === id);
  if (idx < 0) throw new HttpError(404, "Parceiro não encontrado");
  const atual = db.parceiros[idx]!;
  const nome = patch.nome !== undefined ? patch.nome.trim() : atual.nome;
  if (!nome) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const dup = db.parceiros.find((p, i) => i !== idx && p.nome.toLowerCase() === nome.toLowerCase());
  if (dup) throw new HttpError(400, `Nome já usado por outro parceiro (${dup.id})`);
  const atualizado: Parceiro = {
    ...atual,
    nome,
    ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
  };

  if (usePostgresStore()) {
    return upsertParceiroRowToSql(atualizado);
  }

  db.parceiros[idx] = atualizado;
  await saveParceirosDbAsync(db);
  return atualizado;
}

export function atualizarParceiro(id: string, patch: AtualizarParceiroPatch): Parceiro {
  const db = loadParceirosDb();
  const idx = db.parceiros.findIndex((p) => p.id === id);
  if (idx < 0) throw new HttpError(404, "Parceiro não encontrado");
  const atual = db.parceiros[idx]!;
  const nome = patch.nome !== undefined ? patch.nome.trim() : atual.nome;
  if (!nome) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const dup = db.parceiros.find((p, i) => i !== idx && p.nome.toLowerCase() === nome.toLowerCase());
  if (dup) throw new HttpError(400, `Nome já usado por outro parceiro (${dup.id})`);
  db.parceiros[idx] = {
    ...atual,
    nome,
    ...(patch.ativo !== undefined ? { ativo: patch.ativo } : {}),
  };
  saveParceirosDb(db);
  return db.parceiros[idx]!;
}

export async function removerParceiroAsync(id: string): Promise<Parceiro> {
  const db = await loadParceirosDbAsync();
  const idx = db.parceiros.findIndex((p) => p.id === id);
  if (idx < 0) throw new HttpError(404, "Parceiro não encontrado");
  const links = await loadVinculosDbAsync();
  if (links.vinculos.some((v) => v.parceiroId === id)) {
    throw new HttpError(400, "Parceiro possui vínculos com veículos — remova os vínculos primeiro");
  }
  const [removido] = db.parceiros.splice(idx, 1);

  if (usePostgresStore()) {
    const ok = await deleteParceiroRowFromSql(id);
    if (!ok) throw new HttpError(500, "Falha ao remover parceiro no banco de dados");
    return removido!;
  }

  await saveParceirosDbAsync(db);
  return removido!;
}

export function removerParceiro(id: string): Parceiro {
  const db = loadParceirosDb();
  const idx = db.parceiros.findIndex((p) => p.id === id);
  if (idx < 0) throw new HttpError(404, "Parceiro não encontrado");
  const links = loadVinculosDb();
  if (links.vinculos.some((v) => v.parceiroId === id)) {
    throw new HttpError(400, "Parceiro possui vínculos com veículos — remova os vínculos primeiro");
  }
  const [removido] = db.parceiros.splice(idx, 1);
  saveParceirosDb(db);
  return removido!;
}

export function listarVinculos(filtro?: { veiculoId?: string; parceiroId?: string }) {
  let items = loadVinculosDb().vinculos;
  if (filtro?.veiculoId) items = items.filter((v) => v.veiculoId === filtro.veiculoId);
  if (filtro?.parceiroId) items = items.filter((v) => v.parceiroId === filtro.parceiroId);
  return { total: items.length, items };
}

export async function listarVinculosAsync(filtro?: { veiculoId?: string; parceiroId?: string }) {
  let items = (await loadVinculosDbAsync()).vinculos;
  if (filtro?.veiculoId) items = items.filter((v) => v.veiculoId === filtro.veiculoId);
  if (filtro?.parceiroId) items = items.filter((v) => v.parceiroId === filtro.parceiroId);
  return { total: items.length, items };
}

export async function vincularVeiculoParceiroAsync(
  veiculoId: string,
  parceiroId: string,
): Promise<VinculoParceiro> {
  const parceiro = await obterParceiroAsync(parceiroId);
  if (!parceiro) throw new HttpError(404, "Parceiro não encontrado");
  const db = await loadVinculosDbAsync();
  db.vinculos = db.vinculos.filter((v) => v.veiculoId !== veiculoId);
  const vinculo: VinculoParceiro = {
    id: crypto.randomUUID(),
    veiculoId,
    parceiroId: parceiro.id,
  };
  db.vinculos.push(vinculo);
  await saveVinculosDbAsync(db);
  return vinculo;
}

export function vincularVeiculoParceiro(veiculoId: string, parceiroId: string): VinculoParceiro {
  const parceiro = obterParceiro(parceiroId);
  if (!parceiro) throw new HttpError(404, "Parceiro não encontrado");
  const db = loadVinculosDb();
  db.vinculos = db.vinculos.filter((v) => v.veiculoId !== veiculoId);
  const vinculo: VinculoParceiro = {
    id: crypto.randomUUID(),
    veiculoId,
    parceiroId: parceiro.id,
  };
  db.vinculos.push(vinculo);
  saveVinculosDb(db);
  return vinculo;
}

export async function removerVinculoAsync(id: string): Promise<VinculoParceiro> {
  const db = await loadVinculosDbAsync();
  const idx = db.vinculos.findIndex((v) => v.id === id);
  if (idx < 0) throw new HttpError(404, "Vínculo não encontrado");
  const [removido] = db.vinculos.splice(idx, 1);
  await saveVinculosDbAsync(db);
  return removido!;
}

export function removerVinculo(id: string): VinculoParceiro {
  const db = loadVinculosDb();
  const idx = db.vinculos.findIndex((v) => v.id === id);
  if (idx < 0) throw new HttpError(404, "Vínculo não encontrado");
  const [removido] = db.vinculos.splice(idx, 1);
  saveVinculosDb(db);
  return removido!;
}

export function obterParceiroDoVeiculo(veiculoId: string): Parceiro | null {
  const vinculo = loadVinculosDb().vinculos.find((v) => v.veiculoId === veiculoId);
  if (!vinculo) return null;
  return obterParceiro(vinculo.parceiroId);
}
