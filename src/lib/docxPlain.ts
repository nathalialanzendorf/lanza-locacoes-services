import fs from "node:fs";
import PizZip from "pizzip";

/** Texto aproximado do document.xml (só para regex simples). */
export function docxPlainText(docxPath: string): string {
  const buf = fs.readFileSync(docxPath);
  const zip = new PizZip(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml ausente");
  const xml = entry.asText();
  return xml
    .replace(/<w:tab[^/]*\/>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza valores R$ fragmentados pelo XML do Word (ex.: `R$ 80 0,00` → `R$800,00`). */
export function normalizeDocxMoneyText(text: string): string {
  return text.replace(/R\$\s*([\d\s.,]+)/gi, (_m, num: string) => {
    const cleaned = num.replace(/\s/g, "");
    return `R$${cleaned}`;
  });
}

function brMoneyToNumber(s: string): number | null {
  const m = s.match(/R\$\s*([\d.,]+)/i);
  if (!m) return null;
  const raw = m[1]!.replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Procura valor da locação semanal (R$) no texto do contrato. */
export function extrairValorSemanalReais(text: string): number | null {
  const t = normalizeDocxMoneyText(text.normalize("NFD").replace(/\p{M}/gu, ""));
  const patterns: RegExp[] = [
    /(?:locacao|locaçao|locação)\s+semanal[\s\S]{0,160}?(R\$\s*[\d.,]+)/i,
    /semanal[\s\S]{0,160}?(R\$\s*[\d.,]+)/i,
    /(R\$\s*[\d.,]+)[\s\S]{0,160}?semanal/i,
    /realizado\s+semanalmente[\s\S]{0,160}?(R\$\s*[\d.,]+)/i,
    /3\.2[\s\S]{0,220}?(R\$\s*[\d.,]+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = brMoneyToNumber(m[1]!);
      if (n !== null && n > 0 && n < 50000) return n;
    }
  }
  return null;
}
