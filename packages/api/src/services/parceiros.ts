import crypto from "node:crypto";
import path from "node:path";

import {
  jsonDocumentExists,
  loadJsonDocument,
  loadJsonDocumentForApi,
  saveJsonDocument,
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
};

function filtrarParceiros(items: Parceiro[], opts: ListarParceirosOpts): Parceiro[] {
  if (opts.ativo === true) return items.filter(isParceiroAtivo);
  if (opts.ativo === false) return items.filter((p) => !isParceiroAtivo(p));
  return items;
}

function loadParceirosDb(): ParceirosDb {
  if (!jsonDocumentExists(DBP)) return { parceiros: [] };
  const db = loadJsonDocument<ParceirosDb>(DBP);
  if (!Array.isArray(db.parceiros)) db.parceiros = [];
  return db;
}

async function loadParceirosDbAsync(): Promise<ParceirosDb> {
  const db = await loadJsonDocumentForApi<ParceirosDb>(DBP, { parceiros: [] });
  if (!Array.isArray(db.parceiros)) db.parceiros = [];
  return db;
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
