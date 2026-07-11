import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../lib-imports.js";
import { HttpError } from "../http.js";

const DBP = path.join(REPO_ROOT, "database", "parceiros.json");
const DBL = path.join(REPO_ROOT, "database", "parceiro-veiculo.json");

export type Parceiro = { id: string; nome: string };
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

function loadParceirosDb(): ParceirosDb {
  if (!fs.existsSync(DBP)) return { parceiros: [] };
  const db = JSON.parse(fs.readFileSync(DBP, "utf8")) as ParceirosDb;
  if (!Array.isArray(db.parceiros)) db.parceiros = [];
  return db;
}

function saveParceirosDb(db: ParceirosDb): void {
  db.atualizadoEm = hoje();
  fs.writeFileSync(DBP, JSON.stringify(db, null, 2) + "\n", "utf8");
}

function loadVinculosDb(): VinculosDb {
  if (!fs.existsSync(DBL)) return { vinculos: [] };
  const db = JSON.parse(fs.readFileSync(DBL, "utf8")) as VinculosDb;
  if (!Array.isArray(db.vinculos)) db.vinculos = [];
  return db;
}

function saveVinculosDb(db: VinculosDb): void {
  db.atualizadoEm = hoje();
  fs.writeFileSync(DBL, JSON.stringify(db, null, 2) + "\n", "utf8");
}

export function listarParceiros(): { total: number; items: Parceiro[] } {
  const items = loadParceirosDb().parceiros;
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

export function atualizarParceiro(id: string, nome: string): Parceiro {
  const n = nome.trim();
  if (!n) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const db = loadParceirosDb();
  const idx = db.parceiros.findIndex((p) => p.id === id);
  if (idx < 0) throw new HttpError(404, "Parceiro não encontrado");
  const dup = db.parceiros.find((p, i) => i !== idx && p.nome.toLowerCase() === n.toLowerCase());
  if (dup) throw new HttpError(400, `Nome já usado por outro parceiro (${dup.id})`);
  db.parceiros[idx] = { ...db.parceiros[idx]!, nome: n };
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
