/**
 * Fallback FIPE pela placa via https://placafipebrasil.com.br/placa-fipe/{PLACA}
 * quando não há marca/modelo/ano para a API Parallelum.
 */
import https from "node:https";
import { compactPlaca } from "../placa.js";

export const PLACA_FIPE_BRASIL_BASE = "https://placafipebrasil.com.br/placa-fipe";

const agent = new https.Agent({ rejectUnauthorized: false });

export function urlPlacaFipeBrasil(placa: string): string {
  const p = compactPlaca(placa);
  return `${PLACA_FIPE_BRASIL_BASE}/${p}`;
}

export type PlacaFipeBrasilOpcao = {
  fipeCodigo: string;
  fipeModelo: string;
  fipeValor: string;
};

export type PlacaFipeBrasilResultado = {
  fonte: "placafipebrasil";
  url: string;
  placa: string;
  marca?: string;
  modelo?: string;
  marcaModelo?: string;
  anoModelo?: string;
  cor?: string;
  fipeCodigo?: string;
  fipeModelo?: string;
  fipeValor?: string;
  fipeReferencia?: string;
  fipe?: string;
  opcoes: PlacaFipeBrasilOpcao[];
};

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, " "));
}

function cellValue(tdHtml: string): string {
  const a = tdHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  if (a) return stripTags(a[1]!);
  return stripTags(tdHtml);
}

function parseDetailTable(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const table = html.match(/<table[^>]*class=['"]fipeTablePriceDetail['"][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return out;
  const rows = table[1]!.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!cells || cells.length < 2) continue;
    const label = stripTags(cells[0]!).replace(/:$/, "").toLowerCase();
    const value = cellValue(cells[1]!);
    if (label && value) out[label] = value;
  }
  return out;
}

function parseFipeOptions(html: string): PlacaFipeBrasilOpcao[] {
  const table = html.match(/<table[^>]*class=['"]fipe-desktop['"][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];
  const rows = table[1]!.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const opcoes: PlacaFipeBrasilOpcao[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]!));
    if (cells.length < 3) continue;
    const codigo = cells[0]!;
    if (!/^\d/.test(codigo)) continue;
    opcoes.push({
      fipeCodigo: codigo,
      fipeModelo: cells[1]!,
      fipeValor: cells[2]!,
    });
  }
  return opcoes;
}

function httpsGetText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; LanzaLocacoes/1.0)",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          httpsGetText(next).then(resolve, reject);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => resolve({ status, body }));
      },
    );
    req.setTimeout(25_000, () => {
      req.destroy(new Error("Timeout Placa FIPE Brasil"));
    });
    req.on("error", reject);
  });
}

export async function consultarPlacaFipeBrasil(placa: string): Promise<PlacaFipeBrasilResultado> {
  const placaNorm = compactPlaca(placa);
  if (placaNorm.length < 7) {
    throw new Error("Placa inválida para consulta Placa FIPE Brasil.");
  }

  const url = urlPlacaFipeBrasil(placaNorm);
  const { status, body: html } = await httpsGetText(url);
  if (status < 200 || status >= 300) {
    throw new Error(`Placa FIPE Brasil HTTP ${status} (${url})`);
  }

  if (/placa n[aã]o encontrada|n[aã]o encontramos|vehicle not found/i.test(html)) {
    throw new Error(`Placa não encontrada no Placa FIPE Brasil: ${placaNorm}`);
  }

  const detail = parseDetailTable(html);
  const marca = detail.marca;
  const modelo = detail.modelo;
  const ano = detail["ano modelo"] || detail.ano;
  const opcoes = parseFipeOptions(html);
  const best = opcoes[0];

  if (!marca && !modelo && !best) {
    throw new Error(`Sem dados FIPE no Placa FIPE Brasil para ${placaNorm}`);
  }

  const marcaModelo = marca && modelo ? `${marca}/${modelo}` : marca || modelo;

  return {
    fonte: "placafipebrasil",
    url,
    placa: placaNorm,
    marca,
    modelo,
    marcaModelo,
    anoModelo: ano ? `${ano}/${ano}` : undefined,
    cor: detail.cor,
    fipeCodigo: best?.fipeCodigo,
    fipeModelo: best?.fipeModelo,
    fipeValor: best?.fipeValor,
    fipeReferencia: undefined,
    fipe: url,
    opcoes,
  };
}

export function fipeFieldsFromPlacaFipeBrasil(r: PlacaFipeBrasilResultado) {
  return {
    fipe: r.fipe ?? r.url,
    fipeCodigo: r.fipeCodigo,
    fipeModelo: r.fipeModelo,
    fipeValor: r.fipeValor,
    fipeReferencia: r.fipeReferencia,
  };
}
