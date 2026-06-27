import fs from "node:fs";
import path from "node:path";

import pdfParse from "pdf-parse";

import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { readLanzaPaths } from "./lanzaPaths.js";

export type SeguroBoletoExtraido = {
  placa: string;
  valor: number;
  data: string;
  competencia: string;
  origem: string;
};

const PLACA_RE = /[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/;

function parseValorBr(s: string): number | null {
  const t = s.replace(/R\$\s*/i, "").trim();
  if (!t) return null;
  const n = t.includes(",")
    ? parseFloat(t.replace(/\./g, "").replace(",", "."))
    : parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function competenciaFromMesAno(mm: string, aa: string): string {
  const year = aa.length === 2 ? `20${aa}` : aa;
  return `${mm.padStart(2, "0")}/${year}`;
}

export function placaFromFilename(name: string): string | null {
  const base = path.basename(name, path.extname(name));
  const m = base.match(new RegExp(`(${PLACA_RE.source})`, "i"));
  return m ? formatPlacaHyphen(m[1]!) : null;
}

export function parseSeguroComprovanteText(
  text: string,
  opts?: { filename?: string },
): Omit<SeguroBoletoExtraido, "origem"> | null {
  const flat = text.replace(/\s+/g, " ");
  const isCadastramento =
    /taxa de cadastramento/i.test(flat) &&
    !/CONTRIBUI[CÇ][AÃ]O DO M[EÊ]S/i.test(flat);
  if (isCadastramento) return null;

  let data = "";
  const venc1 = text.match(
    /Vencimento[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (venc1) data = venc1[1]!;
  if (!data) {
    const venc2 = flat.match(
      /PAGAVEL EM TODOS BANCOS ATE O VENCIMENTO\s+(\d{2}\/\d{2}\/\d{4})/i,
    );
    if (venc2) data = venc2[1]!;
  }

  let competencia = "";
  const comp = flat.match(
    /CONTRIBUI[CÇ][AÃ]O DO M[EÊ]S\s+(\d{2})\/(\d{2,4})/i,
  );
  if (comp) competencia = competenciaFromMesAno(comp[1]!, comp[2]!);

  let placa = "";
  const placaBlock = flat.match(/PLACA\(S\):\s*([^;]+)/i);
  const placaAlt = flat.match(/\bPlaca:\s*([A-Z0-9]{7})/i);
  if (placaBlock) {
    const pm = placaBlock[1]!.match(PLACA_RE);
    if (pm) placa = formatPlacaHyphen(pm[0]);
  } else if (placaAlt) {
    placa = formatPlacaHyphen(placaAlt[1]!);
  }
  if (!placa && opts?.filename) {
    placa = placaFromFilename(opts.filename) ?? "";
  }

  let valor: number | null = null;
  const valorDoc = text.match(
    /\( = \) Valor do Documento\s*\n?\s*([\d.,]+)/i,
  );
  if (valorDoc) valor = parseValorBr(valorDoc[1]!);
  if (valor == null && placaBlock) {
    const perPlaca = placaBlock[1]!.match(
      new RegExp(`${compactPlaca(placa)}[^)]*\\(R\\$\\s*([\\d.,]+)\\)`, "i"),
    );
    if (perPlaca) valor = parseValorBr(perPlaca[1]!);
  }
  if (valor == null) {
    const rs = flat.match(/\(R\$\s*([\d.,]+)\)/i);
    if (rs) valor = parseValorBr(rs[1]!);
  }

  if (!placa || valor == null) return null;
  if (!competencia && data) {
    const dm = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dm) competencia = `${dm[2]}/${dm[3]}`;
  }
  return { placa, valor, data, competencia };
}

export function origemRelativaDocumentosRaiz(
  absPath: string,
  documentosRaiz: string,
): string {
  const rel = path.relative(documentosRaiz, absPath);
  return rel.split(path.sep).join("/");
}

export function listarPdfSeguro(dirs: string[]): string[] {
  const pdfs = new Set<string>();

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (ext === ".pdf") {
        pdfs.add(full);
      }
    }
  }

  for (const d of dirs) walk(path.resolve(d));

  return [...pdfs].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function extrairSeguroComprovantePdf(
  filePath: string,
  documentosRaiz?: string,
): Promise<SeguroBoletoExtraido | null> {
  const buf = fs.readFileSync(filePath);
  const parsed = await pdfParse(buf);
  const fields = parseSeguroComprovanteText(parsed.text, {
    filename: path.basename(filePath),
  });
  if (!fields) return null;

  const raiz =
    documentosRaiz ||
    readLanzaPaths().documentosRaiz ||
    path.dirname(path.dirname(path.dirname(filePath)));
  const origem = origemRelativaDocumentosRaiz(filePath, raiz);

  return { ...fields, origem };
}

export async function extrairSeguroComprovantesDirs(
  dirs: string[],
): Promise<{ boletos: SeguroBoletoExtraido[]; erros: string[] }> {
  const documentosRaiz = readLanzaPaths().documentosRaiz;
  const pdfs = listarPdfSeguro(dirs);
  const boletos: SeguroBoletoExtraido[] = [];
  const erros: string[] = [];

  for (const pdf of pdfs) {
    try {
      const b = await extrairSeguroComprovantePdf(pdf, documentosRaiz);
      if (b) boletos.push(b);
      else erros.push(`Sem placa/valor: ${pdf}`);
    } catch (e) {
      erros.push(`${pdf}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { boletos, erros };
}

export function defaultSeguroComprovantesDirs(anos: string[]): string[] {
  const cfg = readLanzaPaths();
  const base = cfg.seguroComprovantesDir
    ? path.dirname(cfg.seguroComprovantesDir)
    : path.join(cfg.documentosRaiz || "", "Proteção Veicular", "Comprovantes");
  return anos.map((a) => path.join(base, a));
}
