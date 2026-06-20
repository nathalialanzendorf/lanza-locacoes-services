/**
 * Sincroniza campos do CRLV (PDF) em database/veiculos.json — port de sincronizar_veiculos_crlv.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { REPO_ROOT } from "../lib/repoRoot.js";
import { readLanzaPaths } from "../lib/lanzaPaths.js";

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

function lineBlocks(text: string): string[] {
  return text.replace(/\r/g, "\n").split("\n").map((ln) => ln.trim());
}

function nextMeaningful(lines: string[], start: number): string | null {
  const skip = new Set(["", "-", ".", "..."]);
  for (let j = start; j < Math.min(start + 8, lines.length); j++) {
    const s = lines[j]?.trim() || "";
    if (s && !skip.has(s)) return s;
  }
  return null;
}

function findLineValue(lines: string[], ...labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i]!.toUpperCase();
    for (const lab of labels) {
      if (u.includes(lab.toUpperCase()) && lines[i]!.length < 80) {
        const v = nextMeaningful(lines, i + 1);
        if (v) return v;
      }
    }
  }
  return null;
}

function parseCrlv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = lineBlocks(text);
  const raw = lines.join("\n");

  let m = raw.match(/CHASSI\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
  if (!m) m = raw.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (m && m[1]!.length === 17) out.chassi = m[1]!.toUpperCase();

  m = raw.match(/RENAVAM\s*[:\s]*(\d{10,11})\b/i);
  if (m) out.renavam = m[1]!;

  m = raw.match(
    /PLACA\s*[:\s]*([A-Z]{3}[\dA-Z][A-Z0-9]{4}|[A-Z]{3}\d{4})\b/i,
  );
  if (m) out.placa_doc = formatPlacaHyphen(m[1]!);

  let mm = findLineValue(
    lines,
    "MARCA / MODELO",
    "MARCA/MODELO",
    "MARCA E MODELO",
    "MARCAMODELO",
  );
  if (mm) {
    mm = mm.replace(/\s+/g, " ").trim();
    if (mm.includes("/") || /[A-Z]{2,}/i.test(mm)) {
      out.marcaModelo = /^[\x00-\x7f]+$/.test(mm) ? mm.toUpperCase() : mm;
    }
  }

  const am = findLineValue(lines, "ANO MODELO", "ANO/MODELO", "ANO DO MODELO");
  if (am) {
    const amClean = am.replace(/\s+/g, "");
    let m2 = amClean.match(/(\d{4})\/(\d{4})/);
    if (!m2) m2 = am.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (m2) out.anoModelo = `${m2[1]}/${m2[2]}`;
  }

  let cor = findLineValue(
    lines,
    "COR PREDOMINANTE",
    "COR",
    "COR DO VEÍCULO",
    "COR DO VEICULO",
  );
  if (cor) {
    cor = cor.replace(/\s+/g, " ").trim();
    if (cor.length < 40 && !/^\d+$/.test(cor)) out.cor = cor.toUpperCase();
  }

  if (!out.marcaModelo) {
    m = raw.match(/([A-Z]{2,15})\s*\/\s*([A-Z0-9][A-Z0-9\s.\-]{2,40})/i);
    if (m && m[0]!.length < 60) {
      out.marcaModelo = `${m[1]!.toUpperCase()}/${m[2]!.toUpperCase().trim()}`;
    }
  }

  return out;
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

export async function main(argv: string[]): Promise<void> {
  const { dryRun, placa: filtroRaw } = parseArgs(argv);
  const filtro = filtroRaw ? compactPlaca(filtroRaw) : null;

  if (!fs.existsSync(DBV)) {
    console.error("Não encontrado:", DBV);
    process.exit(1);
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
    console.error("Nenhuma pasta (documentosRaiz ou veiculos/).");
    process.exit(1);
  }

  const index = collectCrlvIndex(roots);
  if (!Object.keys(index).length) {
    console.error("Nenhum PDF de CRLV indexado.");
    process.exit(1);
  }

  let totalChanges = 0;
  const notFound: string[] = [];

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
      console.error(
        `[erro] ${placa} <- ${pdf}:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    const parsed = parseCrlv(text);
    if (!Object.keys(parsed).length) {
      console.error(
        `[aviso] ${placa}: nenhum campo extraído de ${path.basename(pdf)}`,
      );
      continue;
    }
    const ch = mergeIntoVeiculo(v, parsed);
    if (Object.keys(ch).length) {
      totalChanges++;
      console.log(`${placa} <- ${pdf}`);
      for (const [k, [o, n]] of Object.entries(ch)) {
        console.log(`  ${k}: ${JSON.stringify(o)} -> ${JSON.stringify(n)}`);
      }
    }
  }

  if (notFound.length && !filtro) {
    console.log("\nSem PDF indexado para:", notFound.join(", "));
  } else if (notFound.length && filtro) {
    console.error("Sem PDF para placa", filtro);
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n[dry-run] não gravado (nenhuma alteração persistida).");
    return;
  }

  if (totalChanges) {
    data.atualizadoEm = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DBV, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`\nGravado: ${DBV} (${totalChanges} veículo(s) alterados)`);
  } else {
    console.log("Nenhuma alteração aplicada.");
  }
}
