import fs from "node:fs";
import path from "node:path";

import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { defaultContratosDir, readLanzaPaths } from "./lanzaPaths.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";

const PASTA_DEBITOS = "Débitos";

type VeiculoDb = {
  placa?: string;
  pastaVeiculo?: string;
};

function loadVeiculo(placa: string): VeiculoDb | null {
  const p = path.join(REPO_ROOT, "database", "veiculos.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as { veiculos?: VeiculoDb[] };
  const key = compactPlaca(placa);
  return (
    (j.veiculos ?? []).find((v) => v.placa && compactPlaca(v.placa) === key) ?? null
  );
}

/** Pasta do veículo em `documentosRaiz` (campo `pastaVeiculo` ou raiz). */
export function resolverPastaVeiculo(placa: string): string | null {
  const v = loadVeiculo(placa);
  if (!v) return null;
  const pasta = String(v.pastaVeiculo ?? "").trim();
  if (pasta) {
    return path.isAbsolute(pasta) ? pasta : path.join(defaultContratosDir(), pasta);
  }
  return defaultContratosDir();
}

function relativoDocumentosRaiz(absPath: string): string {
  const raiz = readLanzaPaths().documentosRaiz || defaultContratosDir();
  const rel = path.relative(path.resolve(raiz), path.resolve(absPath));
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel.replace(/\\/g, "/");
  return absPath.replace(/\\/g, "/");
}

/** Caminho relativo a `documentosRaiz` para gravar no DB. */
export function caminhoRelativoPdfSalvo(absPath: string): string {
  return relativoDocumentosRaiz(absPath);
}

/** Tipo de PDF gravado na pasta Débitos. */
export type PdfInfracaoTipo = "ait" | "na";

/** Nome do PDF: `{auto} - AIT|NA - {placa}.pdf` */
export function nomeArquivoPdfInfracao(
  autoInfracao: string,
  placa: string,
  tipo: PdfInfracaoTipo = "ait",
): string {
  const auto = String(autoInfracao).trim().replace(/[^\w.-]+/g, "_");
  const pl = compactPlaca(placa);
  const rotulo = tipo === "na" ? "NA" : "AIT";
  return `${auto} - ${rotulo} - ${pl}.pdf`;
}

/** Nome legado do AIT (antes do sufixo `- AIT -`). */
export function nomeArquivoPdfInfracaoLegado(autoInfracao: string, placa: string): string {
  const auto = String(autoInfracao).trim().replace(/[^\w.-]+/g, "_");
  const pl = compactPlaca(placa);
  return `${auto} - ${pl}.pdf`;
}

/** Resolve caminho relativo gravado no DB para absoluto em `documentosRaiz`. */
export function resolverAbsPdfSalvo(caminho: string | null | undefined): string | null {
  const c = String(caminho ?? "").trim();
  if (!c) return null;
  if (path.isAbsolute(c)) return c;
  const raiz = readLanzaPaths().documentosRaiz || defaultContratosDir();
  return path.join(raiz, c);
}

function pdfValidoNoDisco(abs: string): boolean {
  try {
    const st = fs.statSync(abs);
    return st.isFile() && st.size > 64;
  } catch {
    return false;
  }
}

/** Retorna o caminho absoluto se o PDF já existir (DB, nome novo ou legado). */
export function localizarPdfInfracaoExistente(
  reg: ClienteDespesaRegistro,
  tipo: PdfInfracaoTipo,
  caminhoDb?: string | null,
): string | null {
  const absDb = resolverAbsPdfSalvo(caminhoDb);
  if (absDb && pdfValidoNoDisco(absDb)) return absDb;

  const nomes = [nomeArquivoPdfInfracao(reg.autoInfracao, reg.veiculoId, tipo)];
  if (tipo === "ait") {
    nomes.push(nomeArquivoPdfInfracaoLegado(reg.autoInfracao, reg.veiculoId));
  }

  for (const dir of resolverDestinosPdfInfracao(reg)) {
    for (const nome of nomes) {
      const abs = path.join(dir, nome);
      if (pdfValidoNoDisco(abs)) return abs;
    }
  }
  return null;
}

/**
 * Destinos conforme regra sync-infracoes:
 * - Com pasta de contrato → `{condutorContrato}/Débitos/`
 * - Sem vínculo de cliente (`condutorId` ausente) → também `{pastaVeiculo}/Débitos/`
 */
export function resolverDestinosPdfInfracao(reg: ClienteDespesaRegistro): string[] {
  const destinos: string[] = [];
  const contrato = String(reg.condutorContrato ?? "").trim();
  if (contrato) destinos.push(path.join(contrato, PASTA_DEBITOS));

  if (!reg.condutorId) {
    const veiculoDir = resolverPastaVeiculo(reg.veiculoId);
    if (veiculoDir) {
      const vDest = path.join(veiculoDir, PASTA_DEBITOS);
      const norm = path.normalize(vDest).toLowerCase();
      if (!destinos.some((d) => path.normalize(d).toLowerCase() === norm)) {
        destinos.push(vDest);
      }
    }
  }

  if (destinos.length === 0) {
    const veiculoDir = resolverPastaVeiculo(reg.veiculoId);
    if (veiculoDir) destinos.push(path.join(veiculoDir, PASTA_DEBITOS));
  }

  return destinos;
}

export type SalvarPdfInfracaoResult = {
  /** Caminho principal gravado (preferência: pasta do contrato). */
  pdfArquivo: string | null;
  destinos: string[];
  avisos: string[];
};

/** Grava o buffer PDF em cada destino (idempotente se o ficheiro já existir). */
export function salvarPdfInfracao(
  buffer: Buffer,
  reg: ClienteDespesaRegistro,
  opts?: { dryRun?: boolean; tipo?: PdfInfracaoTipo },
): SalvarPdfInfracaoResult {
  const destinos = resolverDestinosPdfInfracao(reg);
  const avisos: string[] = [];
  const nome = nomeArquivoPdfInfracao(reg.autoInfracao, reg.veiculoId, opts?.tipo ?? "ait");
  let pdfArquivo: string | null = null;

  if (destinos.length === 0) {
    avisos.push(
      `Sem pasta destino para PDF ${reg.autoInfracao} (${formatPlacaHyphen(reg.veiculoId)})`,
    );
    return { pdfArquivo: null, destinos, avisos };
  }

  for (const dir of destinos) {
    const abs = path.join(dir, nome);
    if (opts?.dryRun) {
      avisos.push(`[dry-run] PDF → ${abs}`);
      if (!pdfArquivo) pdfArquivo = relativoDocumentosRaiz(abs);
      continue;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(abs)) {
        const existing = fs.statSync(abs);
        if (existing.size === buffer.length && existing.size > 0) {
          avisos.push(`PDF já existe: ${abs}`);
        } else {
          fs.writeFileSync(abs, buffer);
          avisos.push(`PDF atualizado: ${abs}`);
        }
      } else {
        fs.writeFileSync(abs, buffer);
        avisos.push(`PDF gravado: ${abs}`);
      }
      if (!pdfArquivo) pdfArquivo = relativoDocumentosRaiz(abs);
    } catch (e) {
      avisos.push(
        `Falha ao gravar ${abs}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { pdfArquivo, destinos, avisos };
}
