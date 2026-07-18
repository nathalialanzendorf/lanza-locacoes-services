/**
 * init-database helper — extrai JPEGs embutidos de um PDF de CNH-e.
 *
 * Uso:
 *   npx tsx .cursor/tools/init-database/extrair-jpg-cnh.ts <pdf> [prefixoSaida]
 */
import fs from "node:fs";
import path from "node:path";

import { extrairJpegsEmbutidosPdf } from "../../../src/lib/cnhPdfImagem.js";

const src = process.argv[2];
if (!src) {
  console.error("uso: extrair-jpg-cnh.ts <pdf> [prefixoSaida]");
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error(`ficheiro não encontrado: ${src}`);
  process.exit(1);
}

const prefix = process.argv[3] ?? path.join("relatorios", "_tmp", "_cnh");
fs.mkdirSync(path.dirname(prefix), { recursive: true });

const buf = fs.readFileSync(src);
const jpegs = extrairJpegsEmbutidosPdf(buf);

for (let i = 0; i < jpegs.length; i++) {
  const out = `${prefix}_${i}.jpg`;
  fs.writeFileSync(out, jpegs[i]!);
  console.log(`escrito ${out} (${jpegs[i]!.length} bytes)`);
}

console.log(`Total JPEGs extraídos: ${jpegs.length}`);
if (jpegs.length === 0) {
  console.log(
    "Nenhum JPEG embutido (pode ser PNG/JBIG2). Tente ler o PDF diretamente ou converter a página.",
  );
}
