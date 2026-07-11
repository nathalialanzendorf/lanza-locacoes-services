import {

  DETRAN_SC_API_BASE,

  detranScJsonHeaders,

} from "./auth.js";

import type { DetranScInfracao } from "./types.js";

import { compactPlaca } from "../placa.js";

import { loadInfracoesDb } from "../infracoesDb.js";



function pickStr(obj: Record<string, unknown>, keys: string[]): string {

  for (const k of keys) {

    const v = obj[k];

    if (v != null && String(v).trim()) return String(v).trim();

  }

  return "";

}



function extrairAuto(item: DetranScInfracao | Record<string, unknown>): string {

  return pickStr(item as Record<string, unknown>, [

    "numeroAuto",

    "numAuto",

    "autoInfracao",

    "numeroAutoInfracao",

    "auto",

  ]);

}



function extrairIdAutoInfracao(

  item: DetranScInfracao | Record<string, unknown> | undefined,

): number | null {

  if (!item || typeof item !== "object") return null;

  const o = item as Record<string, unknown>;

  const v = o.idAutoInfracao ?? o.id;

  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());

  return null;

}



/** Mescla campos do detranRaw gravado (ex.: senha) quando a API deixa de enviá-los. */

function enriquecerRawItem(

  auto: string,

  rawItem?: DetranScInfracao,

  detranRaw?: Record<string, unknown> | null,

): DetranScInfracao | undefined {

  const base = (rawItem ?? detranRaw) as Record<string, unknown> | undefined;

  if (!base) return rawItem;



  const merged = { ...base };

  if (!pickStr(merged, ["senha"]) && detranRaw) {

    const senha = pickStr(detranRaw, ["senha"]);

    if (senha) merged.senha = senha;

  }

  if (!pickStr(merged, ["senha"]) || !pickStr(merged, ["protocolo"])) {

    const reg = (loadInfracoesDb().infracoes ?? []).find(

      (i) => i.numeroAuto?.trim().toUpperCase() === auto.trim().toUpperCase(),

    );

    const stored = (reg?.detranRaw ?? reg) as Record<string, unknown> | undefined;

    const protocolo = pickStr(stored ?? {}, ["protocolo"]);

    const senha = pickStr(stored ?? {}, ["senha"]);

    if (protocolo && !pickStr(merged, ["protocolo"])) merged.protocolo = protocolo;

    if (senha && !pickStr(merged, ["senha"])) merged.senha = senha;

  }

  return merged as DetranScInfracao;

}



/** `protocolo` + `senha` do DETRAN → `/infracoes/na/{protocolo}/{senha}/`. */

function extrairProtocoloSenha(

  item: DetranScInfracao | Record<string, unknown> | undefined,

): { protocolo: string; senha: string } | null {

  if (!item || typeof item !== "object") return null;

  const o = item as Record<string, unknown>;

  const protocolo = pickStr(o, ["protocolo"]);

  const senha = pickStr(o, ["senha"]);

  if (protocolo && senha) return { protocolo, senha };

  return null;

}



function isPdfBuffer(buf: Buffer): boolean {

  return buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF";

}



function decodeBase64Pdf(raw: string): Buffer | null {

  const s = raw.trim();

  if (!s) return null;

  const b64 = s.includes(",") ? (s.split(",").pop() ?? s) : s;

  try {

    const buf = Buffer.from(b64, "base64");

    return isPdfBuffer(buf) ? buf : null;

  } catch {

    return null;

  }

}



function extractPdfFromJson(j: Record<string, unknown>): Buffer | null {

  for (const k of [

    "pdf",

    "pdfBase64",

    "conteudo",

    "conteudoPdf",

    "documento",

    "data",

    "arquivo",

    "notificacaoPdf",

    "bytes",

    "file",

  ]) {

    const v = j[k];

    if (typeof v === "string") {

      const decoded = decodeBase64Pdf(v);

      if (decoded) return decoded;

    }

  }

  for (const k of ["documento", "data", "resultado", "payload", "content"]) {

    const nested = j[k];

    if (nested && typeof nested === "object" && !Array.isArray(nested)) {

      const buf = extractPdfFromJson(nested as Record<string, unknown>);

      if (buf) return buf;

    }

  }

  return null;

}



function detranScPdfHeaders(): Record<string, string> {

  return {

    ...detranScJsonHeaders(),

    Accept: "application/pdf, application/octet-stream, */*",

  };

}



function urlNotificacaoAutuacao(protocolo: string, senha: string): string {

  const custom = process.env.DETRAN_SC_NA_PDF_PATH?.trim();

  if (custom) {

    return `${DETRAN_SC_API_BASE}${custom

      .replace(/\{protocolo\}/g, encodeURIComponent(protocolo.trim()))

      .replace(/\{senha\}/g, encodeURIComponent(senha.trim()))}`;

  }

  return `${DETRAN_SC_API_BASE}/infracoes/na/${encodeURIComponent(protocolo.trim())}/${encodeURIComponent(senha.trim())}/`;

}



function urlAitPdf(placa: string, ticket: string, idAutoInfracao: number): string {

  const p = compactPlaca(placa);

  return `${DETRAN_SC_API_BASE}/veiculo/ait-pdf?p=${encodeURIComponent(p)}&t=${encodeURIComponent(ticket)}&a=${encodeURIComponent(String(idAutoInfracao))}`;

}



async function fetchPdfUrl(url: string): Promise<Buffer | null> {
  const r = await fetch(url, { headers: detranScPdfHeaders() });
  if (!r.ok) {
    if (process.env.DETRAN_SC_DEBUG === "1") {
      console.error(`[detran-pdf] HTTP ${r.status} ${url}`);
    }
    return null;
  }

  const ct = (r.headers.get("content-type") ?? "").toLowerCase();

  const buf = Buffer.from(await r.arrayBuffer());

  if (isPdfBuffer(buf)) return buf;

  if (ct.includes("json") || ct.includes("text")) {

    try {

      const j = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;

      return extractPdfFromJson(j);

    } catch {

      /* não JSON */

    }

  }

  return null;

}



async function fetchNotificacaoAutuacao(

  protocolo: string,

  senha: string,

): Promise<Buffer | null> {

  const url = urlNotificacaoAutuacao(protocolo, senha);

  const r = await fetch(url, { headers: detranScJsonHeaders() });

  if (!r.ok) {

    if (process.env.DETRAN_SC_DEBUG === "1") {

      console.error(`[detran-pdf] na HTTP ${r.status} ${url}`);

    }

    return null;

  }

  const ct = (r.headers.get("content-type") ?? "").toLowerCase();

  const buf = Buffer.from(await r.arrayBuffer());

  if (isPdfBuffer(buf)) return buf;

  if (ct.includes("json") || buf[0] === 0x7b) {

    try {

      const j = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;

      return extractPdfFromJson(j);

    } catch {

      /* não JSON */

    }

  }

  return null;

}



export type BaixarPdfInfracaoOpts = {

  placa: string;

  renavam: string;

  autoInfracao: string;

  ticket?: string;

  idAutoInfracao?: number | null;

  rawItem?: DetranScInfracao;

  detranRaw?: Record<string, unknown> | null;

  /** Quando false, não chama o DETRAN (PDF já existe localmente). */
  baixarAit?: boolean;

  baixarNa?: boolean;

};



export type PdfInfracaoParte = {

  buffer: Buffer | null;

  url?: string;

  aviso?: string;

};



export type BaixarPdfsInfracaoResult = {

  ait: PdfInfracaoParte;

  notificacao: PdfInfracaoParte;

};



async function baixarAitPdf(

  opts: BaixarPdfInfracaoOpts,

  rawItem: DetranScInfracao | undefined,

): Promise<PdfInfracaoParte> {

  const idAuto = opts.idAutoInfracao ?? extrairIdAutoInfracao(rawItem);

  if (!opts.ticket || idAuto == null) {

    return { buffer: null, aviso: "AIT: requer ticket da consulta + idAutoInfracao" };

  }

  const url = urlAitPdf(opts.placa, opts.ticket, idAuto);

  try {

    const buf = await fetchPdfUrl(url);

    if (buf) return { buffer: buf, url };

    return { buffer: null, url, aviso: "AIT não obtido (ait-pdf)" };

  } catch (e) {

    return {

      buffer: null,

      url,

      aviso: `AIT: ${e instanceof Error ? e.message : String(e)}`,

    };

  }

}



async function baixarNotificacaoPdf(

  rawItem: DetranScInfracao | undefined,

): Promise<PdfInfracaoParte> {

  const na = extrairProtocoloSenha(rawItem);

  if (!na) {

    return { buffer: null, aviso: "NA: requer protocolo + senha no payload DETRAN" };

  }

  const url = urlNotificacaoAutuacao(na.protocolo, na.senha);

  try {

    const buf = await fetchNotificacaoAutuacao(na.protocolo, na.senha);

    if (buf) return { buffer: buf, url };

    return { buffer: null, url, aviso: "Notificação não obtida (infracoes/na)" };

  } catch (e) {

    return {

      buffer: null,

      url,

      aviso: `NA: ${e instanceof Error ? e.message : String(e)}`,

    };

  }

}



/** Baixa auto de infração (AIT) e notificação de autuação (NA), quando possível. */

export async function baixarPdfsInfracaoDetranSc(

  opts: BaixarPdfInfracaoOpts,

): Promise<BaixarPdfsInfracaoResult> {

  const auto = extrairAuto(opts.rawItem ?? {}) || opts.autoInfracao.trim();

  if (!auto) {

    const aviso = "auto de infração ausente";

    return { ait: { buffer: null, aviso }, notificacao: { buffer: null, aviso } };

  }



  const rawItem = enriquecerRawItem(auto, opts.rawItem, opts.detranRaw);
  const baixarAit = opts.baixarAit !== false;
  const baixarNa = opts.baixarNa !== false;
  const ait = baixarAit
    ? await baixarAitPdf(opts, rawItem)
    : { buffer: null as Buffer | null, aviso: "AIT já baixado (pulado)" };
  const notificacao = baixarNa
    ? await baixarNotificacaoPdf(rawItem)
    : { buffer: null as Buffer | null, aviso: "NA já baixada (pulado)" };
  return { ait, notificacao };
}



/** @deprecated Use `baixarPdfsInfracaoDetranSc` — mantido para compatibilidade. */

export async function baixarPdfInfracaoDetranSc(

  opts: BaixarPdfInfracaoOpts,

): Promise<{

  buffer: Buffer | null;

  origem: "ait-pdf" | "na" | null;

  url?: string;

  aviso?: string;

}> {

  const { ait, notificacao } = await baixarPdfsInfracaoDetranSc(opts);

  if (ait.buffer) return { buffer: ait.buffer, origem: "ait-pdf", url: ait.url };

  if (notificacao.buffer) return { buffer: notificacao.buffer, origem: "na", url: notificacao.url };

  return {

    buffer: null,

    origem: null,

    aviso: [ait.aviso, notificacao.aviso].filter(Boolean).join("; "),

  };

}


