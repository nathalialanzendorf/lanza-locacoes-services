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

/** Procura valor da locação semanal (R$) no texto do contrato. */
export function extrairValorSemanalReais(text: string): number | null {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "");
  const patterns: RegExp[] = [
    /(?:locacao|locaçao|locação)\s+semanal[^\dR$]{0,120}?(R\$\s*[\d.,]+)/i,
    /semanal[^\dR$]{0,120}?(R\$\s*[\d.,]+)/i,
    /(R\$\s*[\d.,]+)[^\dR$]{0,120}?semanal/i,
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

function brMoneyToNumber(s: string): number | null {
  const m = s.match(/R\$\s*([\d.,]+)/i);
  if (!m) return null;
  const raw = m[1]!.replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
