/**
 * Sincroniza campos do CRLV (PDF) em database/veiculos.json — port de sincronizar_veiculos_crlv.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { REPO_ROOT } from "../lib/repoRoot.js";
import { readLanzaPaths } from "../lib/lanzaPaths.js";
import { parseCrlvText } from "../lib/documentosParse.js";

const DBV = path.join(REPO_ROOT, "database", "veiculos.json");
const VEIC_DIR = path.join(REPO_ROOT, "veiculos");

function compactPlaca(p: string): string {
  return String(p || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatPlacaHyphen(p: string): string {
  const c = compactPlaca(p);
  if (c.length === 7) return `${c.slice(0, 3)}-${c.slice(3)}`;
  return c;
}

function loadDocumentosRaiz(): string | null {
  const cfg = readLanzaPaths();
  const p = cfg.documentosRaiz;
  return p || null;
}

function normalizePdfStem(stem: string): string {
  stem = stem.replace(/\s*\(\d+\)\s*$/i, "").trim();
  return compactPlaca(stem);
}

function* walkPdf(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) yield* walkPdf(full);
      else if (
        e.isFile() &&
        e.name.toLowerCase().endsWith(".pdf") &&
        !e.name.startsWith("~$")
      ) {
        yield full;
      }
    } catch {
      /* skip */
    }
  }
}

function collectCrlvIndex(roots: string[]): Record<string, string> {
  const buckets = new Map<string, string[]>();
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    for (const pdf of walkPdf(root)) {
      const stem = path.basename(pdf, path.extname(pdf));
      const key = normalizePdfStem(stem);
      if (key.length !== 7) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(pdf);
    }
  }
  const index: Record<string, string> = {};
  for (const [key, paths] of buckets) {
    paths.sort((a, b) => {
      const da = a.split(path.sep).length;
      const db = b.split(path.sep).length;
      if (da !== db) return da - db;
      return a.localeCompare(b);
    });
    index[key] = paths[0]!;
  }
  return index;
}

async function extractPdfText(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  return data.text || "";
}

function mergeIntoVeiculo(
  existing: Record<string, unknown>,
  parsed: Record<string, string>,
): Record<string, [string, string]> {
  const changes: Record<string, [string, string]> = {};
  const fieldMap: [string, string][] = [
    ["marcaModelo", "marcaModelo"],
    ["anoModelo", "anoModelo"],
    ["chassi", "chassi"],
    ["renavam", "renavam"],
    ["cor", "cor"],
  ];
  for (const [jsonKey, srcKey] of fieldMap) {
    if (!parsed[srcKey]) continue;
    const newv = String(parsed[srcKey]).trim();
    if (!newv) continue;
    const oldv = String(existing[jsonKey] ?? "").trim();
    if (oldv !== newv) {
      existing[jsonKey] = newv;
      changes[jsonKey] = [oldv, newv];
    }
  }
  if (parsed.placa_doc) {
    const newp = formatPlacaHyphen(parsed.placa_doc);
    const oldp = String(existing.placa ?? "")
      .trim()
      .toUpperCase();
    if (compactPlaca(newp) !== compactPlaca(oldp)) {
      changes._placa_doc_diff = [oldp, newp];
    }
  }
  return changes;
}

function parseArgs(argv: string[]): { dryRun: boolean; placa: string | null } {
  let dryRun = false;
  let placa: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    if (argv[i] === "--placa" && argv[i + 1]) {
      placa = argv[i + 1]!;
      i++;
    }
  }
  return { dryRun, placa };
}

export type SincronizarVeiculosCrlvOpts = {
  dryRun?: boolean;
  placa?: string;
};

export type SincronizarVeiculosCrlvResult = {
  alterados: number;
  naoEncontrados: string[];
  gravado: boolean;
  erros: { placa: string; motivo: string }[];
};

export async function sincronizarVeiculosCrlv(
  opts: SincronizarVeiculosCrlvOpts = {},
): Promise<SincronizarVeiculosCrlvResult> {
  const dryRun = opts.dryRun ?? false;
  const filtro = opts.placa ? compactPlaca(opts.placa) : null;

  if (!fs.existsSync(DBV)) {
    throw new Error(`Não encontrado: ${DBV}`);
  }

  const data = JSON.parse(fs.readFileSync(DBV, "utf8")) as {
    veiculos: Record<string, unknown>[];
    atualizadoEm?: string;
  };
  const veiculos = data.veiculos || [];

  const roots: string[] = [];
  const dr = loadDocumentosRaiz();
  if (dr) roots.push(dr);
  if (fs.existsSync(VEIC_DIR)) roots.push(VEIC_DIR);

  if (!roots.length) {
    throw new Error("Nenhuma pasta (documentosRaiz ou veiculos/).");
  }

  const index = collectCrlvIndex(roots);
  if (!Object.keys(index).length) {
    throw new Error("Nenhum PDF de CRLV indexado.");
  }

  let totalChanges = 0;
  const notFound: string[] = [];
  const erros: { placa: string; motivo: string }[] = [];

  for (const v of veiculos) {
    const placa = String(v.placa ?? "");
    const key = compactPlaca(placa);
    if (filtro && key !== filtro) continue;
    const pdf = index[key];
    if (!pdf) {
      notFound.push(placa);
      continue;
    }
    let text: string;
    try {
      text = await extractPdfText(pdf);
    } catch (e) {
      erros.push({
        placa,
        motivo: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    const parsedRaw = parseCrlvText(text);
    const parsed: Record<string, string> = {};
    if (parsedRaw.placa) parsed.placa_doc = parsedRaw.placa;
    if (parsedRaw.marcaModelo) parsed.marcaModelo = parsedRaw.marcaModelo;
    if (parsedRaw.anoModelo) parsed.anoModelo = parsedRaw.anoModelo;
    if (parsedRaw.chassi) parsed.chassi = parsedRaw.chassi;
    if (parsedRaw.renavam) parsed.renavam = parsedRaw.renavam;
    if (parsedRaw.cor) parsed.cor = parsedRaw.cor;
    if (!Object.keys(parsed).length) {
      erros.push({ placa, motivo: `nenhum campo extraído de ${path.basename(pdf)}` });
      continue;
    }
    const ch = mergeIntoVeiculo(v, parsed);
    if (Object.keys(ch).length) {
      totalChanges++;
    }
  }

  if (filtro && notFound.length) {
    throw new Error(`Sem PDF para placa ${filtro}`);
  }

  let gravado = false;
  if (!dryRun && totalChanges) {
    data.atualizadoEm = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DBV, JSON.stringify(data, null, 2) + "\n", "utf8");
    gravado = true;
  }

  return { alterados: totalChanges, naoEncontrados: notFound, gravado, erros };
}

export async function main(argv: string[]): Promise<void> {
  const { dryRun, placa: filtroRaw } = parseArgs(argv);
  const r = await sincronizarVeiculosCrlv({
    dryRun,
    placa: filtroRaw ?? undefined,
  });

  if (r.erros.length) {
    for (const e of r.erros) {
      console.error(`[erro] ${e.placa}: ${e.motivo}`);
    }
  }
  if (r.naoEncontrados.length && !filtroRaw) {
    console.log("\nSem PDF indexado para:", r.naoEncontrados.join(", "));
  }
  if (dryRun) {
    console.log("\n[dry-run] não gravado (nenhuma alteração persistida).");
    return;
  }
  if (r.gravado) {
    console.log(`\nGravado: ${DBV} (${r.alterados} veículo(s) alterados)`);
  } else {
    console.log("Nenhuma alteração aplicada.");
  }
}
