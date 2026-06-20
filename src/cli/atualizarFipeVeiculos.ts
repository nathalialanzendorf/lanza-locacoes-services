/**
 * Atualiza `database/veiculos.json`: fipe, fipeCodigo, fipeModelo, fipeValor, fipeReferencia.
 * Port de atualizar_fipe_veiculos.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fipeGet } from "../lib/fipeParallelum.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

const DB = path.join(REPO_ROOT, "database", "veiculos.json");

const BRAND_HINTS: Record<string, string[]> = {
  VW: ["vw", "volks"],
  HYUNDAI: ["hyundai"],
  FORD: ["ford"],
  FIAT: ["fiat"],
  RENAULT: ["renault"],
  PEUGEOT: ["peugeot"],
};

const EXTRAS_BY_PLACA: Record<string, string> = {
  "AVU-6740": "4p",
  "MLN-0B87": "1.6",
};

const _MES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function refParaMesano(ref: string): string {
  const m = String(ref || "")
    .toLowerCase()
    .match(/([a-zçãéíóúâ]+)\s+de\s+(\d{4})/);
  if (!m) return "";
  const mo = _MES[m[1]!] || 0;
  return mo ? `${mo}-${m[2]}` : "";
}

function slugMarca(nome: string): string {
  const n = String(nome || "")
    .trim()
    .toLowerCase();
  if (["vw", "volkswagen", "vw-volkswagen"].includes(n)) return "vw-volkswagen";
  return n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function anoReferencia(anoModelo: string): number | null {
  const s = String(anoModelo || "").trim();
  const parts = s.split("/").map((x) => x.trim());
  if (parts.length >= 2 && /^\d{4}$/.test(parts[1]!)) return parseInt(parts[1]!, 10);
  if (parts.length >= 1 && /^\d{4}$/.test(parts[0]!)) return parseInt(parts[0]!, 10);
  return null;
}

function hintBlob(v: Veiculo): string {
  const extra = EXTRAS_BY_PLACA[v.placa] || "";
  return `${v.marcaModelo || ""} ${v.fipeModelo || ""} ${extra}`.toLowerCase();
}

type Veiculo = {
  placa: string;
  marcaModelo?: string;
  fipeModelo?: string;
  anoModelo?: string;
  observacao?: string;
  [key: string]: unknown;
};

function tokensFromHints(
  marcaModelo: string,
  fipeModelo: string,
  extraLower: string,
): string[] {
  const rest = (marcaModelo || "").split("/").slice(1).join(" ");
  const raw = `${rest} ${fipeModelo || ""} ${extraLower || ""}`.toLowerCase();
  return [
    ...new Set(
      raw
        .split(/[^a-z0-9çãéíóúâ]+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}

function scoreModel(nameLower: string, toks: string[]): number {
  let s = 0;
  for (const t of toks) {
    if (nameLower.includes(t)) s += t.length >= 4 ? 3 : 2;
  }
  return s;
}

function engineVersionsFromHints(v: Veiculo): string[] {
  const mm = (v.marcaModelo || "").toLowerCase();
  const ex = (EXTRAS_BY_PLACA[v.placa] || "").toLowerCase();
  const chunk = `${mm} ${ex}`;
  let engines = [...chunk.matchAll(/\b(\d\.\d)\b/g)].map((m) => m[1]!);
  engines = [...new Set(engines)];
  if (engines.length) return engines;
  const fm = (v.fipeModelo || "").toLowerCase();
  return [...new Set([...fm.matchAll(/\b(\d\.\d)\b/g)].map((m) => m[1]!))];
}

function doorFromHints(v: Veiculo): string | null {
  const ex = (EXTRAS_BY_PLACA[v.placa] || "").toLowerCase();
  const m0 = ex.match(/\b([2-5])p\b/);
  if (m0) return `${m0[1]}p`;
  const mm = (v.marcaModelo || "").toLowerCase();
  const m1 = mm.match(/\b([2-5])p\b/);
  if (m1) return `${m1[1]}p`;
  const fm = (v.fipeModelo || "").toLowerCase();
  const m2 = fm.match(/\b([2-5])p\b/);
  return m2 ? `${m2[1]}p` : null;
}

function doorConstraint(v: Veiculo, nameLower: string): number {
  const want = doorFromHints(v);
  if (!want) return 0;
  if (nameLower.includes(want)) return 40;
  for (const d of ["2p", "3p", "4p", "5p"]) {
    if (d !== want && nameLower.includes(d)) return -1e9;
  }
  return -12;
}

function scoreModelFull(m: { name: string }, v: Veiculo): number {
  const hintsLower = hintBlob(v);
  const nl = m.name.toLowerCase();
  const toks = tokensFromHints(
    v.marcaModelo || "",
    v.fipeModelo || "",
    EXTRAS_BY_PLACA[v.placa] || "",
  );
  let sc = scoreModel(nl, toks);

  const engines = engineVersionsFromHints(v);
  for (const e of engines) {
    if (!nl.includes(e)) return -1e9;
  }

  sc += doorConstraint(v, nl);
  if (hintsLower.includes("sedan") && nl.includes("sedan")) sc += 25;
  if (hintsLower.includes("trendline") && nl.includes("trendline")) sc += 25;
  if (hintsLower.includes("allure") && nl.includes("allure")) sc += 25;
  if (hintsLower.includes("style") && nl.includes("style")) sc += 25;
  if (hintsLower.includes("connect") && nl.includes("connect")) sc += 20;
  if (hintsLower.includes("expression") && nl.includes("expression")) sc += 15;

  return sc;
}

type Brand = { code: string; name: string };
type Model = { code: string; name: string };
type Year = { code: string; name: string };
type FipeDetail = {
  codeFipe?: string;
  model?: string;
  price?: string;
  referenceMonth?: string;
  modelYear?: string;
  brand?: string;
};

function findBrand(brands: Brand[], prefix: string): Brand | undefined {
  const p = String(prefix || "").trim().toUpperCase();
  const hints = BRAND_HINTS[p] || [p.toLowerCase()];
  return brands.find((b) => {
    const n = b.name.toLowerCase();
    return hints.some((h) => n.includes(h));
  });
}

function yearRows(years: Year[]) {
  return years
    .map((e) => {
      const m = e.name.match(/\b(20\d{2})\b/);
      return m ? { code: e.code, name: e.name, yr: parseInt(m[1]!, 10) } : null;
    })
    .filter((x): x is { code: string; name: string; yr: number } => Boolean(x));
}

function pickYearCode(
  years: Year[],
  targetYear: number,
  hintsLower: string,
): string | null {
  let pool = yearRows(years);
  if (!pool.length) return null;

  const flex = /flex/.test(hintsLower);
  const gnv = /gnv/.test(hintsLower);
  if (flex) {
    const fp = pool.filter((e) => /flex/i.test(e.name));
    if (fp.length) pool = fp;
  }
  if (gnv) {
    const g = pool.find((e) => /gnv/i.test(e.name));
    if (g) return g.code;
  }

  const order = [
    targetYear,
    targetYear - 1,
    targetYear + 1,
    targetYear - 2,
    targetYear + 2,
    targetYear - 3,
    targetYear + 3,
  ];
  for (const ty of order) {
    const hit = pool.find((e) => e.yr === ty);
    if (hit) return hit.code;
  }
  pool.sort(
    (a, b) => Math.abs(a.yr - targetYear) - Math.abs(b.yr - targetYear),
  );
  return pool[0]!.code;
}

async function resolveVehicle(
  v: Veiculo,
  brands: Brand[],
): Promise<{
  fipe: string;
  fipeCodigo: string | undefined;
  fipeModelo: string | undefined;
  fipeValor: string | undefined;
  fipeReferencia: string | undefined;
}> {
  const marcaModelo = v.marcaModelo || "";
  const prefix = marcaModelo.split("/")[0]?.trim() || "";
  const brand = findBrand(brands, prefix);
  if (!brand) throw new Error(`marca não encontrada: ${prefix} (${v.placa})`);

  const models = await fipeGet<Model[]>(`/brands/${brand.code}/models`);
  const scored = models
    .map((m) => ({ m, sc: scoreModelFull(m, v) }))
    .filter((x) => x.sc > -1e8)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 12);

  if (!scored.length) {
    throw new Error(`modelo não encontrado: ${marcaModelo} (${v.placa})`);
  }

  const targetY = anoReferencia(v.anoModelo || "");
  if (!targetY) throw new Error(`ano modelo inválido: ${v.anoModelo} (${v.placa})`);

  const hints = hintBlob(v);

  let bestD: FipeDetail | null = null;
  let bestDist = 1e9;
  let bestSc = -1e10;

  for (const { m, sc } of scored) {
    let years: Year[];
    try {
      years = await fipeGet<Year[]>(
        `/brands/${brand.code}/models/${m.code}/years`,
      );
    } catch {
      continue;
    }
    const ycode = pickYearCode(years, targetY, hints);
    if (!ycode) continue;
    let d: FipeDetail;
    try {
      d = await fipeGet<FipeDetail>(
        `/brands/${brand.code}/models/${m.code}/years/${ycode}`,
      );
    } catch {
      continue;
    }
    const my = parseInt(String(d.modelYear), 10);
    if (Number.isNaN(my)) continue;
    const dist = Math.abs(my - targetY);
    if (dist < bestDist || (dist === bestDist && sc > bestSc)) {
      bestDist = dist;
      bestSc = sc;
      bestD = d;
    }
  }

  if (!bestD) {
    throw new Error(`combinação modelo/ano FIPE não encontrada (${v.placa})`);
  }

  const marca_slug = slugMarca(bestD.brand || brand.name);
  const mesano = refParaMesano(bestD.referenceMonth || "");
  const url = `https://veiculos.fipe.org.br?carro/${marca_slug}/${mesano}/${bestD.codeFipe}/${bestD.modelYear}`;

  return {
    fipe: url,
    fipeCodigo: bestD.codeFipe,
    fipeModelo: bestD.model,
    fipeValor: bestD.price,
    fipeReferencia: bestD.referenceMonth,
  };
}

function parseArgs(argv: string[]): { placaFilter: string | null } {
  let placaFilter: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--placa" && argv[i + 1]) {
      placaFilter = argv[i + 1]!;
      i++;
    }
  }
  return { placaFilter };
}

function normPlaca(s: string): string {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

type VeiculosDb = { veiculos: Veiculo[]; atualizadoEm?: string };

async function runFipeSyncCore(
  placaFilter: string | null,
): Promise<{ errors: { placa: string; erro: string }[]; notFound?: string }> {
  const raw = fs.readFileSync(DB, "utf8");
  const data = JSON.parse(raw) as VeiculosDb;
  const brands = await fipeGet<Brand[]>("/brands");
  const errors: { placa: string; erro: string }[] = [];

  const lista = placaFilter
    ? data.veiculos.filter((v) => normPlaca(v.placa) === normPlaca(placaFilter))
    : data.veiculos;

  if (placaFilter && lista.length === 0) {
    return { errors: [], notFound: placaFilter };
  }

  for (const v of lista) {
    try {
      const upd = await resolveVehicle(v, brands);
      Object.assign(v, upd);
      if (v.placa === "RAH-4F54" && v.observacao && /fipe/i.test(String(v.observacao))) {
        delete v.observacao;
      }
      console.log("OK", v.placa, "->", upd.fipeCodigo, upd.fipeModelo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("ERRO", v.placa, msg);
      errors.push({ placa: v.placa, erro: msg });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  data.atualizadoEm = today;
  fs.writeFileSync(DB, JSON.stringify(data, null, 2) + "\n", "utf8");

  if (errors.length) {
    console.error("\nFalhas:", JSON.stringify(errors, null, 2));
  }
  return { errors };
}

/** Chamado após cadastrar veículo — não encerra o processo em falha FIPE. */
export async function syncFipeNovoVeiculo(placa: string): Promise<void> {
  if (!placa?.trim()) return;
  const r = await runFipeSyncCore(placa.trim());
  if (r.notFound) {
    console.error("[aviso] Placa nao encontrada em veiculos.json:", r.notFound);
    return;
  }
  if (r.errors.length) {
    console.error("[aviso] FIPE sync com falhas (veja acima)");
  } else {
    console.log("[fipe] campos FIPE atualizados na API");
  }
}

export async function main(argv: string[]): Promise<void> {
  const { placaFilter } = parseArgs(argv);
  const r = await runFipeSyncCore(placaFilter);
  if (r.notFound) {
    console.error("Placa nao encontrada em veiculos.json:", r.notFound);
    process.exit(1);
  }
  if (r.errors.length) process.exitCode = 1;
}
