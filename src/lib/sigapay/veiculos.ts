/**
 * Veículos (placas) no portal SigaPay — cadastro e listagem.
 * Paths configuráveis via env após captura no DevTools.
 */
import { compactPlaca, formatPlacaHyphen } from "../placa.js";
import { SIGAPAY_ORIGIN } from "./auth.js";
import { apiFetchJson, apiFetchRaw, pickArray, SigapayAuthError } from "./client.js";

const REGISTER_PATH = process.env.SIGAPAY_PATH_PLACA_REGISTER?.trim() || "/Placa/register";
const DELETE_PATH = process.env.SIGAPAY_PATH_PLACA_DELETE?.trim() || "/Placa/delete";
const VEICULOS_PATHS = (
  process.env.SIGAPAY_PATH_PLACAS?.trim() || "/Placa/list,/Placa,/Veiculo"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export type RegistrarPlacaSigapayInput = {
  placa: string;
  modelo?: string;
  apelido?: string;
};

export type VeiculoSigapay = {
  placa: string;
  modelo: string | null;
  id: string | null;
  raw: Record<string, unknown>;
};

function pickStr(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function normalizarVeiculo(item: unknown): VeiculoSigapay | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const placa = pickStr(o, ["placa", "nrPlaca", "plate", "placaVeiculo"]);
  if (!placa) return null;
  return {
    placa: formatPlacaHyphen(placa),
    modelo: pickStr(o, ["modelo", "dsModelo", "apelido", "model"]),
    id: pickStr(o, ["idUsuarioPlaca", "idPlaca", "id", "idVeiculo"]),
    raw: o,
  };
}

export async function registrarPlacaSigapay(input: RegistrarPlacaSigapayInput): Promise<{
  ok: boolean;
  status: number;
  placa: string;
  body: string;
}> {
  const placa = compactPlaca(input.placa);
  const payload: Record<string, unknown> = { placa };
  if (input.modelo?.trim()) payload.modelo = input.modelo.trim();
  if (input.apelido?.trim()) payload.apelido = input.apelido.trim();

  const r = await apiFetchRaw(REGISTER_PATH, {
    method: "POST",
    referer: `${SIGAPAY_ORIGIN}/`,
    body: payload,
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, placa: formatPlacaHyphen(placa), body };
}

export async function excluirPlacaSigapay(id: string | number): Promise<{
  ok: boolean;
  status: number;
  body: string;
}> {
  const r = await apiFetchRaw(`${DELETE_PATH}/${id}`, {
    method: "POST",
    referer: `${SIGAPAY_ORIGIN}/`,
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

export async function listarVeiculosSigapay(): Promise<VeiculoSigapay[]> {
  let lastErr: unknown = null;
  for (const p of VEICULOS_PATHS) {
    try {
      const raw = await apiFetchJson(p);
      const arr = pickArray(raw, ["placas", "veiculos", "data", "items"]);
      const out = arr.map(normalizarVeiculo).filter((v): v is VeiculoSigapay => v !== null);
      if (out.length || Array.isArray(raw) || arr.length === 0) return out;
    } catch (e) {
      if (e instanceof SigapayAuthError) throw e;
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export async function excluirPlacaSigapayPorPlaca(placa: string): Promise<{
  ok: boolean;
  status: number;
  body: string;
  placa: string;
  id: string | null;
  naoEncontrada: boolean;
}> {
  const alvo = compactPlaca(placa);
  const formatada = formatPlacaHyphen(placa);
  const lista = await listarVeiculosSigapay();
  const v = lista.find((x) => compactPlaca(x.placa) === alvo);
  if (!v || !v.id) {
    return { ok: true, status: 0, body: "", placa: formatada, id: v?.id ?? null, naoEncontrada: true };
  }
  const r = await excluirPlacaSigapay(v.id);
  return { ...r, placa: formatada, id: v.id, naoEncontrada: false };
}
