import {
  DETRAN_SC_API_BASE,
  detranScJsonHeaders,
} from "./auth.js";
import type { DetranScInfracao } from "./types.js";
import { compactPlaca } from "../placa.js";

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

/** PDF embutido ou URL no objeto bruto da infração (se o portal passar). */
function pdfDoPayloadBruto(raw: DetranScInfracao | undefined): Buffer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  for (const k of ["pdf", "pdfBase64", "conteudoPdf", "documentoPdf", "notificacaoPdf"]) {
    const v = o[k];
    if (typeof v === "string") {
      const buf = decodeBase64Pdf(v);
      if (buf) return buf;
    }
  }

  for (const k of ["urlPdf", "urlNotificacao", "linkNotificacao", "linkImpressao", "url"]) {
    const v = o[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return null; // fetch separado abaixo
  }

  return null;
}

function detranScPdfHeaders(): Record<string, string> {
  return {
    ...detranScJsonHeaders(),
    Accept: "application/pdf, application/octet-stream, */*",
  };
}

function montarUrlsPdf(
  auto: string,
  placa: string,
  renavam: string,
): string[] {
  const p = compactPlaca(placa);
  const r = String(renavam).replace(/\D/g, "");
  const a = encodeURIComponent(auto);
  const custom = process.env.DETRAN_SC_INFRACAO_PDF_PATH?.trim();
  const urls: string[] = [];

  if (custom) {
    urls.push(
      `${DETRAN_SC_API_BASE}${custom
        .replace(/\{auto\}/g, encodeURIComponent(auto))
        .replace(/\{placa\}/g, encodeURIComponent(p))
        .replace(/\{renavam\}/g, encodeURIComponent(r))}`,
    );
  }

  const paths = [
    `/infracao/notificacao/imprimir?numeroAuto=${a}&placa=${encodeURIComponent(p)}&renavam=${encodeURIComponent(r)}`,
    `/infracao/notificacao/imprimir?numAuto=${a}&placa=${encodeURIComponent(p)}`,
    `/infracao/notificacao/pdf?numeroAuto=${a}&placa=${encodeURIComponent(p)}`,
    `/infracao/notificacao?numeroAuto=${a}&placa=${encodeURIComponent(p)}`,
    `/infracao/pdf?numeroAuto=${a}&placa=${encodeURIComponent(p)}&renavam=${encodeURIComponent(r)}`,
    `/veiculo/infracao/notificacao-pdf?numeroAuto=${a}&placa=${encodeURIComponent(p)}&renavam=${encodeURIComponent(r)}`,
    `/veiculo/infracao/pdf?numeroAuto=${a}&placa=${encodeURIComponent(p)}&renavam=${encodeURIComponent(r)}`,
  ];

  for (const path of paths) urls.push(`${DETRAN_SC_API_BASE}${path}`);
  return [...new Set(urls)];
}

async function fetchPdfUrl(url: string): Promise<Buffer | null> {
  const r = await fetch(url, { headers: detranScPdfHeaders() });
  if (!r.ok) return null;
  const ct = (r.headers.get("content-type") ?? "").toLowerCase();
  const buf = Buffer.from(await r.arrayBuffer());
  if (isPdfBuffer(buf)) return buf;
  if (ct.includes("json") || ct.includes("text")) {
    try {
      const j = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
      for (const k of ["pdf", "pdfBase64", "conteudo", "data", "documento"]) {
        const v = j[k];
        if (typeof v === "string") {
          const decoded = decodeBase64Pdf(v);
          if (decoded) return decoded;
        }
      }
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
  rawItem?: DetranScInfracao;
};

export type BaixarPdfInfracaoResult = {
  buffer: Buffer | null;
  origem: "payload" | "api" | null;
  url?: string;
  aviso?: string;
};

/** Tenta baixar o PDF da notificação/auto de infração no DETRAN SC. */
export async function baixarPdfInfracaoDetranSc(
  opts: BaixarPdfInfracaoOpts,
): Promise<BaixarPdfInfracaoResult> {
  const auto = extrairAuto(opts.rawItem ?? {}) || opts.autoInfracao.trim();
  if (!auto) return { buffer: null, origem: null, aviso: "auto de infração ausente" };

  const embedded = pdfDoPayloadBruto(opts.rawItem);
  if (embedded) return { buffer: embedded, origem: "payload" };

  const urls = montarUrlsPdf(auto, opts.placa, opts.renavam);
  for (const url of urls) {
    try {
      const buf = await fetchPdfUrl(url);
      if (buf) return { buffer: buf, origem: "api", url };
    } catch (e) {
      /* tenta próximo */
      if (process.env.DETRAN_SC_DEBUG === "1") {
        console.error(`[detran-pdf] ${url}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  return {
    buffer: null,
    origem: null,
    aviso:
      "PDF não obtido (endpoint pode ter mudado — defina DETRAN_SC_INFRACAO_PDF_PATH ou recapture no portal)",
  };
}
