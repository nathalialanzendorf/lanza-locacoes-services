import fs from "node:fs";
import path from "node:path";

import { gerar, type GerarContratoDados } from "../lib/docxGerar.js";
import { montarDadosContratoFromDb } from "../lib/montarDadosContrato.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

function absRepo(p: string | undefined): string | undefined {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

function normalizePaths(dados: GerarContratoDados): void {
  for (const k of ["template", "contratosDir", "cnhArquivo"] as const) {
    if (dados[k]) {
      (dados as unknown as Record<string, string | undefined>)[k] = absRepo(dados[k] as string);
    }
  }
}

function printResult(r: ReturnType<typeof gerar>): void {
  console.log(`Pasta -> ${r.pasta}`);
  console.log(`Word  -> ${r.docx}`);
  if (r.pdf) console.log(`PDF   -> ${r.pdf}`);
  if (r.cnh) console.log(`CNH   -> ${r.cnh}`);
  else console.log('[aviso] CNH.pdf nao copiada (informe "cnhArquivo" ou --cnh-arquivo)');
}

type CliFlags = {
  jsonPath: string | null;
  placa: string | null;
  cpf: string | null;
  cliente: string | null;
  semana: number | null;
  caucao: number | null;
  periodo: string | null;
  dias: number | null;
  inicio: string | null;
  hora: string | null;
  diaPagamento: string | null;
  cnhArquivo: string | null;
  diaria: number | null;
  template: string | null;
  contratosDir: string | null;
  outJson: string | null;
  dryRun: boolean;
};

function parseNum(v: string, label: string): number {
  const s = v.replace(/R\$\s*/i, "").trim();
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  if (!Number.isFinite(n)) throw new Error(`${label} inválido: ${v}`);
  return Math.round(n * 100) / 100;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    jsonPath: null,
    placa: null,
    cpf: null,
    cliente: null,
    semana: null,
    caucao: null,
    periodo: null,
    dias: null,
    inicio: null,
    hora: null,
    diaPagamento: null,
    cnhArquivo: null,
    diaria: null,
    template: null,
    contratosDir: null,
    outJson: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    switch (a) {
      case "--placa":
        flags.placa = next ?? null;
        i++;
        break;
      case "--cpf":
        flags.cpf = next ?? null;
        i++;
        break;
      case "--cliente":
        flags.cliente = next ?? null;
        i++;
        break;
      case "--semana":
        flags.semana = next ? parseNum(next, "--semana") : null;
        i++;
        break;
      case "--caucao":
        flags.caucao = next ? parseNum(next, "--caucao") : null;
        i++;
        break;
      case "--periodo":
        flags.periodo = next ?? null;
        i++;
        break;
      case "--dias":
        flags.dias = next ? parseInt(next, 10) : null;
        i++;
        break;
      case "--inicio":
        flags.inicio = next ?? null;
        i++;
        break;
      case "--hora":
        flags.hora = next ?? null;
        i++;
        break;
      case "--dia-pagamento":
        flags.diaPagamento = next ?? null;
        i++;
        break;
      case "--cnh-arquivo":
        flags.cnhArquivo = next ?? null;
        i++;
        break;
      case "--diaria":
        flags.diaria = next ? parseNum(next, "--diaria") : null;
        i++;
        break;
      case "--template":
        flags.template = next ?? null;
        i++;
        break;
      case "--contratos-dir":
        flags.contratosDir = next ?? null;
        i++;
        break;
      case "--out":
        flags.outJson = next ?? null;
        i++;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      default:
        if (!a.startsWith("-") && !flags.jsonPath) {
          flags.jsonPath = path.resolve(a);
        }
        break;
    }
  }
  return flags;
}

function printUsage(): void {
  console.error(`Uso:
  gerar-contrato <dados.json>

  gerar-contrato --placa PLACA --cpf CPF --semana VALOR --caucao VALOR [opções]

Opções (modo database):
  --cliente "Nome"       Busca por nome (alternativa a --cpf)
  --periodo PERIODO      diaria | 1 semana | 15 dias | 3 meses | 6 meses | 1 ano (padrão: 3 meses)
  --dias N               Sobrescreve --periodo
  --inicio DD/MM/AAAA    Padrão: hoje
  --hora HH:MM           Padrão: 18:00
  --dia-pagamento TEXTO  Padrão: todos os sábados
  --cnh-arquivo CAMINHO  Copia CNH.pdf na pasta do contrato
  --diaria VALOR         Padrão: 120
  --template CAMINHO     Padrão: templates/Contrato - Modelo v3.docx
  --contratos-dir DIR    Padrão: config/lanza_paths.json
  --out dados.json       Grava JSON montado (sem gerar .docx)
  --dry-run              Mostra JSON montado no stdout

Exemplo:
  npx tsx src/run.ts gerar-contrato --placa QJB-0I83 --cpf 123.456.789-00 \\
    --semana 650 --caucao 1500 --periodo "3 meses" --cnh-arquivo "D:/Dropbox/Aluguel Carros/CNH.pdf"
`);
}

function isDbMode(f: CliFlags): boolean {
  return Boolean(f.placa || f.cpf || f.cliente || f.semana != null || f.caucao != null);
}

export function main(argv: string[]): void {
  const f = parseArgs(argv);

  if (f.jsonPath && isDbMode(f)) {
    console.error("[erro] Use <dados.json> OU flags --placa/--cpf, não ambos.");
    printUsage();
    process.exit(1);
  }

  let dados: GerarContratoDados;

  if (f.jsonPath) {
    dados = JSON.parse(fs.readFileSync(f.jsonPath, "utf8")) as GerarContratoDados;
    normalizePaths(dados);
  } else if (f.placa && f.semana != null && f.caucao != null && (f.cpf || f.cliente)) {
    dados = montarDadosContratoFromDb({
      placa: f.placa,
      cpf: f.cpf ?? undefined,
      clienteNome: f.cliente ?? undefined,
      semana: f.semana,
      caucao: f.caucao,
      periodo: f.periodo ?? undefined,
      dias: f.dias ?? undefined,
      inicio: f.inicio ?? undefined,
      hora: f.hora ?? undefined,
      diaPagamento: f.diaPagamento ?? undefined,
      cnhArquivo: f.cnhArquivo ?? undefined,
      diaria: f.diaria ?? undefined,
      template: f.template ?? undefined,
      contratosDir: f.contratosDir ?? undefined,
    });
    normalizePaths(dados);
  } else {
    printUsage();
    process.exit(1);
  }

  if (f.outJson) {
    fs.writeFileSync(path.resolve(f.outJson), JSON.stringify(dados, null, 2), "utf8");
    console.log(`JSON -> ${path.resolve(f.outJson)}`);
    if (f.dryRun) return;
  }

  if (f.dryRun) {
    console.log(JSON.stringify(dados, null, 2));
    return;
  }

  const r = gerar(dados);
  printResult(r);
}
