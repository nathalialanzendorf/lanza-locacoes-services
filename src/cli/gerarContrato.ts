import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../lib/repoRoot.js";
import { gerar, type GerarContratoDados } from "../lib/docxGerar.js";

function absRepo(p: string | undefined): string | undefined {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

export function main(argv: string[]): void {
  const jsonPath = path.resolve(argv[0]!);
  const dados = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as GerarContratoDados;
  for (const k of ["template", "contratosDir", "cnhArquivo"] as const) {
    if (dados[k]) {
      (dados as Record<string, string | undefined>)[k] = absRepo(dados[k] as string);
    }
  }
  const r = gerar(dados);
  console.log(`Pasta -> ${r.pasta}`);
  console.log(`Word  -> ${r.docx}`);
  if (r.pdf) console.log(`PDF   -> ${r.pdf}`);
  if (r.cnh) console.log(`CNH   -> ${r.cnh}`);
  else console.log('[aviso] CNH.pdf nao copiada (informe "cnhArquivo" no dados.json)');
}
