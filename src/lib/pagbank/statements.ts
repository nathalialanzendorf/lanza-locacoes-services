/**
 * Extrato PagBank (minhaconta.pagbank.com.br) — créditos na conta.
 */
import { pagBankHeaders, PAGBANK_API } from "./auth.js";

export type PagBankCredito = {
  id: string;
  valor: number;
  dataBr: string;
  horaBr: string | null;
  dataIso: string;
  descricao: string;
  nomePagador: string | null;
  raw: Record<string, unknown>;
};

export type ListCreditosOpts = {
  initialDate: string;
  finalDate: string;
  page?: number;
  pageSize?: number;
};

function parseAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.abs(v);
  if (typeof v === "string") {
    const n = Number(
      v
        .replace(/\u00a0/g, " ")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, ""),
    );
    if (Number.isFinite(n)) return Math.abs(n);
  }
  return null;
}

function parseDateParts(raw: unknown): { dataBr: string; horaBr: string | null; dataIso: string } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (m) {
    const dataBr = `${m[3]}/${m[2]}/${m[1]}`;
    const horaBr = m[4] != null ? `${m[4]}:${m[5]}` : null;
    const d = new Date(s);
    return { dataBr, horaBr, dataIso: Number.isNaN(d.getTime()) ? s : d.toISOString() };
  }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m) {
    const dataBr = `${m[1]}/${m[2]}/${m[3]}`;
    const horaBr = m[4] != null ? `${m[4]}:${m[5]}` : null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 12), Number(m[5] ?? 0));
    return { dataBr, horaBr, dataIso: d.toISOString() };
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractNomePagador(descricao: string, obj: Record<string, unknown>): string | null {
  const direct = pickString(obj, [
    "payerName",
    "counterPartyName",
    "counterpartyName",
    "senderName",
    "originName",
    "customerName",
    "name",
  ]);
  if (direct) return direct;

  const d = descricao.toUpperCase();
  const patterns = [
    /RECEB(?:IDO|IMENTO)\s+(?:DE|VIA\s+PIX\s+DE)?\s+(.+?)(?:\s+-|\s+\||$)/i,
    /PIX\s+RECEBIDO\s+DE\s+(.+?)(?:\s+-|\s+\||$)/i,
    /TRANSFER[ÊE]NCIA\s+DE\s+(.+?)(?:\s+-|\s+\||$)/i,
  ];
  for (const re of patterns) {
    const m = descricao.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function isCreditEntry(obj: Record<string, unknown>): boolean {
  const sign = pickString(obj, ["operationSign", "signal", "type", "operationType", "balanceSign"]).toUpperCase();
  if (sign === "C" || sign === "CREDIT" || sign === "CREDITO" || sign === "CRÉDITO" || sign === "POSITIVE") {
    return true;
  }
  const type = pickString(obj, ["type"]).toUpperCase();
  if (/PIX_RECEIVE|PAYMENT_RELEASE|TRANSFER_RECEIVE|CREDIT|RECEB/i.test(type)) return true;
  if (obj.reversal === true) return false;
  const amount = obj.amount ?? obj.value ?? obj.total ?? obj.transactionAmount;
  if (typeof amount === "number" && amount > 0) return true;
  if (typeof amount === "string" && parseAmount(amount) != null && parseAmount(amount)! > 0) {
    return sign !== "NEGATIVE";
  }
  const desc = pickString(obj, ["description", "title", "info", "memo", "defaultStatementDescription"]).toLowerCase();
  if (/receb|credito|crédito|pix receb|transfer.*receb|vendas/i.test(desc)) return true;
  return false;
}

function mapEntry(obj: Record<string, unknown>, idx: number): PagBankCredito | null {
  if (!isCreditEntry(obj)) return null;
  const valor =
    parseAmount(obj.amount) ??
    parseAmount(obj.value) ??
    parseAmount(obj.total) ??
    parseAmount(obj.transactionAmount);
  if (valor == null || valor <= 0) return null;

  const descricao =
    [
      pickString(obj, [
        "defaultStatementDescription",
        "description",
        "title",
        "info",
        "memo",
        "statementDescription",
        "operationDescription",
      ]),
      pickString(obj, ["movementDescription"]),
    ]
      .filter(Boolean)
      .join(" — ") || pickString(obj, ["movementDescription"]);

  const dateRaw =
    obj.referenceDateTime ??
    obj.transactionDate ??
    obj.date ??
    obj.createdAt ??
    obj.postingDate ??
    obj.movementDate;
  const dt = parseDateParts(dateRaw);
  if (!dt) return null;

  const id =
    pickString(obj, ["checkingAccountOperationId", "id", "transactionId", "statementId", "code"]) ||
    `pagbank-${idx}-${dt.dataBr}-${valor}`;

  const nomePagador =
    pickString(obj, ["movementDescription"]) ||
    extractNomePagador(descricao, obj) ||
    null;

  return {
    id,
    valor,
    dataBr: dt.dataBr,
    horaBr: dt.horaBr ?? (pickString(obj, ["dateTime"]) || null),
    dataIso: dt.dataIso,
    descricao,
    nomePagador,
    raw: obj,
  };
}

function collectEntries(body: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 6 || body == null) return;
  if (Array.isArray(body)) {
    for (const item of body) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        out.push(item as Record<string, unknown>);
      }
      collectEntries(item, out, depth + 1);
    }
    return;
  }
  if (typeof body === "object") {
    const o = body as Record<string, unknown>;
    const keys = [
      "statements",
      "statementCheckingAccount",
      "statementMovement",
      "content",
      "items",
      "data",
      "results",
      "transactions",
      "movements",
      "statementList",
    ];
    let nested = false;
    for (const k of keys) {
      if (k in o) {
        nested = true;
        collectEntries(o[k], out, depth + 1);
      }
    }
    if (!nested && ("amount" in o || "value" in o || "description" in o || "title" in o || "checkingAccountOperationId" in o)) {
      out.push(o);
    }
  }
}

export async function fetchCreditosPagBank(
  opts: ListCreditosOpts,
): Promise<{ creditos: PagBankCredito[]; raw: unknown }> {
  const page = opts.page ?? 1;
  const q = new URLSearchParams({
    operationSign: "C",
    initialDate: opts.initialDate,
    finalDate: opts.finalDate,
    page: String(page),
  });
  const url = `${PAGBANK_API}/checkingaccount/statements/list?${q.toString()}`;
  const r = await fetch(url, { method: "GET", headers: pagBankHeaders() });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`PagBank HTTP ${r.status}: ${text.slice(0, 400)}`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`PagBank resposta inválida: ${text.slice(0, 200)}`);
  }

  const entries: Record<string, unknown>[] = [];
  collectEntries(body, entries);
  const creditos: PagBankCredito[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const c = mapEntry(e, i);
    if (!c) return;
    const key = `${c.id}|${c.dataBr}|${c.valor}`;
    if (seen.has(key)) return;
    seen.add(key);
    creditos.push(c);
  });

  return { creditos, raw: body };
}

/** Busca todas as páginas (até limite) de créditos no intervalo. */
export async function fetchAllCreditosPagBank(
  opts: Omit<ListCreditosOpts, "page"> & { maxPages?: number },
): Promise<PagBankCredito[]> {
  const maxPages = opts.maxPages ?? 20;
  const all: PagBankCredito[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const { creditos } = await fetchCreditosPagBank({ ...opts, page });
    if (creditos.length === 0) break;
    for (const c of creditos) {
      const key = `${c.id}|${c.dataBr}|${c.valor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(c);
    }
    if (creditos.length < 30) break;
  }
  return all.sort((a, b) => a.dataIso.localeCompare(b.dataIso));
}

export function defaultDateRange(): { initialDate: string; finalDate: string } {
  const fim = new Date();
  const ini = new Date(fim);
  ini.setDate(ini.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { initialDate: fmt(ini), finalDate: fmt(fim) };
}
