import fs from "node:fs";
import path from "node:path";

import {
  docxPlainText,
  extrairValorSemanalReais,
  normalizeDocxMoneyText,
} from "./docxPlain.js";
import { formatPlacaHyphen } from "./placa.js";

export type ContratoExtraido = {
  pastaContrato: string;
  docx: string;
  clienteNome: string;
  placa: string;
  cpf: string | null;
  inicio: Date;
  fim: Date;
  prazoDias: number;
  valorSemanal: number;
  valorCaucao: number;
  valorDiaria: number;
};

function brMoneyToNumber(s: string): number | null {
  const m = s.match(/R\$\s*([\d.,]+)/i);
  if (!m) return null;
  const raw = m[1]!.replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseDataBr(s: string): Date | null {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const h = m[4] !== undefined ? Number(m[4]) : 12;
  const min = m[5] !== undefined ? Number(m[5]) : 0;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h, min, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseDataPasta(nomePasta: string): Date | null {
  const m4 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*/);
  if (m4) {
    const dt = new Date(Number(m4[3]), Number(m4[2]) - 1, Number(m4[1]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{2})(?!\d)\s*-\s*/);
  if (m2) {
    const yy = Number(m2[3]);
    const y = yy >= 50 ? 1900 + yy : 2000 + yy;
    const dt = new Date(y, Number(m2[2]) - 1, Number(m2[1]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function clienteDaPasta(nomePasta: string): string | null {
  const m = nomePasta.match(/^\d{2}\.\d{2}\.\d{2,4}\s*-\s*(.+)$/);
  return m ? m[1]!.trim() : null;
}

function extrairPlaca(texto: string): string | null {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "");
  const m = t.match(/placa:\s*([A-Z0-9-]+)/i);
  return m ? formatPlacaHyphen(m[1]!) : null;
}

function extrairCpf(texto: string): string | null {
  const m = texto.match(/CPF sob o n[°º]\s*([\d.\-]+)/i);
  return m ? m[1]!.trim() : null;
}

function extrairPrazoDias(texto: string): number | null {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "");
  const m = t.match(/lapso temporal de validade de\s+(\d+)\s+dias/i);
  return m ? Number(m[1]) : null;
}

function extrairPeriodo(
  texto: string,
  inicioPasta: Date,
  prazoDias: number,
): { inicio: Date; fim: Date } {
  const t = normalizeDocxMoneyText(texto.normalize("NFD").replace(/\p{M}/gu, ""));
  const m = t.match(
    /iniciando no dia\s+(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})[^e]+e terminando no dia\s+(\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4})/i,
  );
  if (m) {
    const ini = parseDataBr(m[1]!.replace(/\s/g, ""));
    const fim = parseDataBr(m[2]!.replace(/\s/g, ""));
    if (ini && fim) return { inicio: ini, fim };
  }
  const fim = new Date(inicioPasta);
  fim.setDate(fim.getDate() + prazoDias);
  return { inicio: inicioPasta, fim };
}

function extrairCaucao(texto: string, valorSemanal: number): number {
  const t = normalizeDocxMoneyText(texto.normalize("NFD").replace(/\p{M}/gu, ""));
  const patterns = [
    /cau[cç][aã]o[\s\S]{0,120}?(R\$\s*[\d.,]+)/i,
    /valor\s+ca[\s\S]{0,40}?u[cç][aã]o[\s\S]{0,80}?(R\$\s*[\d.,]+)/i,
    /3\.3[\s\S]{0,180}?(R\$\s*[\d.,]+)/i,
    /(R\$\s*[\d.,]+)[\s\S]{0,80}?cau[cç][aã]o/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = brMoneyToNumber(m[1]!);
      if (n !== null && n > 0) return n;
    }
  }
  return Math.round(valorSemanal * 2.31 * 100) / 100;
}

function findContratoDocx(pastaContrato: string): string {
  const ents = fs.readdirSync(pastaContrato);
  const docx = ents.find((f) => /^Contrato.*\.docx$/i.test(f));
  if (!docx) throw new Error(`Contrato*.docx não encontrado em ${pastaContrato}`);
  return path.join(pastaContrato, docx);
}

export function resolverPastaContrato(input: string): string {
  const abs = path.resolve(input);
  if (fs.statSync(abs).isFile()) {
    return path.dirname(abs);
  }
  if (/^Contrato.*\.docx$/i.test(path.basename(abs))) {
    return path.dirname(abs);
  }
  return abs;
}

export function extrairContrato(pastaOuDocx: string): ContratoExtraido {
  const pastaContrato = resolverPastaContrato(pastaOuDocx);
  const docx = findContratoDocx(pastaContrato);
  const nomePasta = path.basename(pastaContrato);
  const inicioPasta = parseDataPasta(nomePasta);
  const clienteNome = clienteDaPasta(nomePasta);
  if (!inicioPasta || !clienteNome) {
    throw new Error(`Pasta de contrato inválida (esperado DD.MM.AAAA - Nome): ${nomePasta}`);
  }

  const texto = docxPlainText(docx);
  const placa = extrairPlaca(texto);
  if (!placa) throw new Error(`Placa não encontrada no contrato: ${docx}`);

  const valorSemanal = extrairValorSemanalReais(texto);
  if (!valorSemanal) throw new Error(`Valor semanal não encontrado no contrato: ${docx}`);

  const prazoDias = extrairPrazoDias(texto) ?? 90;
  const { inicio, fim } = extrairPeriodo(texto, inicioPasta, prazoDias);
  const valorCaucao = extrairCaucao(texto, valorSemanal);
  const valorDiaria = Math.round((valorSemanal / 7) * 100) / 100;

  return {
    pastaContrato,
    docx,
    clienteNome,
    placa,
    cpf: extrairCpf(texto),
    inicio,
    fim,
    prazoDias,
    valorSemanal,
    valorCaucao,
    valorDiaria,
  };
}

export function fmtDataBr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
