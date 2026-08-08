/**
 * Fluxo público PIX do SigaPay (pix.sigapay.com.br) — sem sessão logada.
 *
 * 1. POST /regularization-pix-code  { phone, plate } → id + SMS
 * 2. POST /regularization-pix-verify { id, code }    → PIX / débitos
 */
import { compactPlaca } from "../placa.js";
import { fetchWithTimeout } from "../httpTimeout.js";
import { sigapayUserAgent } from "./auth.js";

export const SIGAPAY_PIX_ORIGIN = (
  process.env.SIGAPAY_PIX_ORIGIN?.trim() || "https://pix.sigapay.com.br"
).replace(/\/$/, "");

export const SIGAPAY_PIX_API_BASE = (
  process.env.SIGAPAY_PIX_API_BASE?.trim() || "https://api.sigapay.com.br/api"
).replace(/\/$/, "");

function pixHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: SIGAPAY_PIX_ORIGIN,
    Referer: `${SIGAPAY_PIX_ORIGIN}/`,
    "User-Agent": sigapayUserAgent(),
    "Accept-Language": "pt,en-US;q=0.9,en;q=0.8,pt-BR;q=0.7",
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function extractId(raw: Record<string, unknown>): string {
  for (const k of ["id", "requestId", "rpcId"]) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const nested = asRecord(raw.data);
  for (const k of ["id", "requestId", "rpcId"]) {
    const v = nested[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function pixPost(path: string, body: unknown): Promise<unknown> {
  const url = `${SIGAPAY_PIX_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: pixHeaders(),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`SigaPay PIX: resposta não-JSON (HTTP ${r.status}): ${text.slice(0, 200)}`);
    }
  }
  if (!r.ok) {
    const o = asRecord(payload);
    const msg =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error) ||
      text.slice(0, 200) ||
      `HTTP ${r.status}`;
    throw new Error(`SigaPay PIX: ${msg}`);
  }
  return payload ?? {};
}

export type PixRegularizacaoSolicitarResult = {
  id: string;
  phone: string;
  plate: string;
  raw: Record<string, unknown>;
};

export type PixRegularizacaoVerificarResult = {
  id: string;
  raw: Record<string, unknown>;
};

/** Passo 1 — solicita SMS e devolve `id` para verificação. */
export async function solicitarCodigoPixRegularizacao(
  phone: string,
  plate: string,
): Promise<PixRegularizacaoSolicitarResult> {
  const tel = normalizePhone(phone);
  const placa = compactPlaca(plate);
  if (tel.length < 10) throw new Error('Campo "phone" inválido (mínimo 10 dígitos).');
  if (placa.length < 7) throw new Error('Campo "plate" inválido (mínimo 7 caracteres).');

  const raw = asRecord(
    await pixPost("/regularization-pix-code", { phone: tel, plate: placa }),
  );
  const id = extractId(raw);
  if (!id) {
    throw new Error(
      "SigaPay PIX não devolveu id para verificação — confirme telefone e placa.",
    );
  }
  return { id, phone: tel, plate: placa, raw };
}

/** Passo 2 — valida OTP e devolve dados PIX (estrutura pass-through do portal). */
export async function verificarCodigoPixRegularizacao(
  id: string,
  code: string,
): Promise<PixRegularizacaoVerificarResult> {
  const rpcId = id.trim();
  const otp = code.replace(/\D/g, "");
  if (!rpcId) throw new Error('Campo "id" é obrigatório.');
  if (!otp) throw new Error('Campo "code" (OTP SMS) é obrigatório.');

  const raw = asRecord(await pixPost("/regularization-pix-verify", { id: rpcId, code: otp }));
  return { id: rpcId, raw };
}
