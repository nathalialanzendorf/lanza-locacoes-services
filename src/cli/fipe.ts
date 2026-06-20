/**
 * Consulta FIPE (API parallelum) — equivalente a fipe.py.
 */
import { fipeGet } from "../lib/fipeParallelum.js";

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

function slugMarca(nome: string): string {
  const n = nome.trim().toLowerCase();
  if (["vw", "volkswagen", "vw-volkswagen"].includes(n)) return "vw-volkswagen";
  return n
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function refParaMesano(ref: string): string {
  const m = String(ref || "")
    .toLowerCase()
    .match(/([a-zçãéíóúâ]+)\s+de\s+(\d{4})/);
  if (!m) return "";
  const mo = _MES[m[1]!] ?? 0;
  return mo ? `${mo}-${m[2]}` : "";
}

type Brand = { code: string; name: string };
type Model = { code: string; name: string };
type Year = { code: string; name: string };
type Valor = {
  brand?: string;
  codeFipe?: string;
  model?: string;
  price?: string;
  modelYear?: string;
  fuel?: string;
  referenceMonth?: string;
};

export async function main(argv: string[]): Promise<void> {
  if (argv.length < 1) {
    console.error(`Uso:
  fipe marca <texto>
  fipe modelos <marcaCode> [filtro...]
  fipe anos <marcaCode> <modeloCode> [filtro]
  fipe valor <marcaCode> <modeloCode> <anoCode>`);
    process.exit(2);
  }
  const cmd = argv[0]!;

  if (cmd === "marca") {
    const alvo = argv[1];
    if (!alvo) {
      console.error("Uso: fipe marca <texto>");
      process.exit(2);
    }
    const alvoLower = alvo.toLowerCase();
    const brands = await fipeGet<Brand[]>("/brands");
    for (const b of brands) {
      if (alvoLower && !b.name.toLowerCase().includes(alvoLower)) continue;
      console.log(b.code, "|", b.name);
    }
  } else if (cmd === "modelos") {
    const mc = argv[1]!;
    const filtro = argv.slice(2).map((w) => w.toLowerCase());
    const models = await fipeGet<Model[]>(`/brands/${mc}/models`);
    for (const m of models) {
      const n = m.name.toLowerCase();
      if (filtro.length && !filtro.every((w) => n.includes(w))) continue;
      console.log(m.code, "|", m.name);
    }
  } else if (cmd === "anos") {
    const mc = argv[1]!;
    const mod = argv[2]!;
    const filtro = argv.slice(3).map((w) => w.toLowerCase());
    const years = await fipeGet<Year[]>(`/brands/${mc}/models/${mod}/years`);
    for (const y of years) {
      const n = y.name.toLowerCase();
      if (filtro.length && !filtro.every((w) => n.includes(w))) continue;
      console.log(y.code, "|", y.name);
    }
  } else if (cmd === "valor") {
    const mc = argv[1]!;
    const mod = argv[2]!;
    const ano = argv[3]!;
    const d = await fipeGet<Valor>(
      `/brands/${mc}/models/${mod}/years/${ano}`,
    );
    const marca_slug = slugMarca(d.brand || "");
    const mesano = refParaMesano(d.referenceMonth || "");
    const url = `https://veiculos.fipe.org.br?carro/${marca_slug}/${mesano}/${d.codeFipe}/${d.modelYear}`;
    const out = {
      fipeCodigo: d.codeFipe,
      fipeModelo: d.model,
      price: d.price,
      modelYear: d.modelYear,
      fuel: d.fuel,
      referenceMonth: d.referenceMonth,
      url,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.error("Comando desconhecido:", cmd);
    process.exit(2);
  }
}
