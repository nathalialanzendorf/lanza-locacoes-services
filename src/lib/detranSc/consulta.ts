import { compactPlaca } from "../placa.js";
import {
  DETRAN_SC_API_BASE,
  detranScJsonHeaders,
} from "./auth.js";
import type { DetranScConsultaVeiculo } from "./types.js";

const CONSULTA_PATHS = [
  "/veiculo/consulta",
  "/veiculo/solicitar-consulta",
] as const;

const RESPOSTA_PATH = "/veiculo/resposta-consulta";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickTicket(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  for (const k of ["t", "ticket", "uuid", "id", "protocolo", "token"]) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const nested = [o.data, o.resultado, o.payload].find((x) => x && typeof x === "object");
  if (nested) return pickTicket(nested);
  return null;
}

function hasVeiculoPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const check = (x: Record<string, unknown>) =>
    Array.isArray(x.infracoes) ||
    Array.isArray(x.historicoInfracoes) ||
    Array.isArray(x.debitos) ||
    x.placa != null;

  if (check(o)) return true;
  for (const k of ["data", "veiculo", "resultado", "payload", "content"]) {
    const nested = o[k];
    if (nested && typeof nested === "object" && check(nested as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
}

async function iniciarConsulta(
  placa: string,
  renavam: string,
): Promise<{ ticket: string | null; direct: DetranScConsultaVeiculo | null }> {
  const headers = {
    ...detranScJsonHeaders(),
    "Content-Type": "application/json",
  };
  const placaApi = compactPlaca(placa);
  const renavamApi = String(renavam).replace(/\D/g, "");

  const bodies = [
    { placa: placaApi, renavam: renavamApi },
    { placa: placaApi, renavam: Number(renavamApi) },
  ];

  for (const path of CONSULTA_PATHS) {
    const url = `${DETRAN_SC_API_BASE}${path}`;

    for (const body of bodies) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const raw = await r.json().catch(() => null);
        if (r.ok && hasVeiculoPayload(raw)) {
          return { ticket: null, direct: raw as DetranScConsultaVeiculo };
        }
        const ticket = pickTicket(raw);
        if (ticket) return { ticket, direct: null };
      } catch {
        /* tenta próximo */
      }
    }

    try {
      const qs = new URLSearchParams({ placa: placaApi, renavam: renavamApi });
      const r = await fetch(`${url}?${qs}`, { method: "GET", headers: detranScJsonHeaders() });
      const raw = await r.json().catch(() => null);
      if (r.ok && hasVeiculoPayload(raw)) {
        return { ticket: null, direct: raw as DetranScConsultaVeiculo };
      }
      const ticket = pickTicket(raw);
      if (ticket) return { ticket, direct: null };
    } catch {
      /* tenta próximo path */
    }
  }

  return { ticket: null, direct: null };
}

async function buscarResposta(ticket: string): Promise<DetranScConsultaVeiculo> {
  const url = `${DETRAN_SC_API_BASE}${RESPOSTA_PATH}?t=${encodeURIComponent(ticket)}`;
  const delays = [500, 1000, 1500, 2000, 2500, 3000];

  for (let i = 0; i < delays.length; i++) {
    const r = await fetch(url, { headers: detranScJsonHeaders() });
    const raw = await r.json().catch(() => ({}));

    if (r.status === 202 || r.status === 204) {
      await sleep(delays[i]!);
      continue;
    }

    if (!r.ok) {
      const msg =
        typeof raw === "object" && raw && "message" in raw
          ? String((raw as { message: unknown }).message)
          : `HTTP ${r.status}`;
      throw new Error(`DETRAN SC resposta-consulta: ${msg}`);
    }

    if (hasVeiculoPayload(raw)) return raw as DetranScConsultaVeiculo;

    const pendente =
      typeof raw === "object" &&
      raw &&
      ("status" in raw || "situacao" in raw) &&
      /process|pendente|aguard/i.test(
        String((raw as Record<string, unknown>).status ?? (raw as Record<string, unknown>).situacao),
      );

    if (pendente) {
      await sleep(delays[i]!);
      continue;
    }

    return raw as DetranScConsultaVeiculo;
  }

  throw new Error("DETRAN SC: timeout aguardando resposta-consulta");
}

/** Consulta veículo no portal Detran Digital SC (placa + renavam). */
export async function consultarVeiculoDetranSc(
  placa: string,
  renavam: string,
): Promise<DetranScConsultaVeiculo> {
  const { ticket, direct } = await iniciarConsulta(placa, renavam);
  if (direct) return direct;
  if (!ticket) {
    throw new Error(
      "DETRAN SC: não foi possível iniciar consulta (verifique token, X-Empresa e placa/renavam).",
    );
  }
  return buscarResposta(ticket);
}

/** Busca resposta quando o operador já tem o ticket `t` copiado do DevTools. */
export async function consultarVeiculoDetranScPorTicket(
  ticket: string,
): Promise<DetranScConsultaVeiculo> {
  return buscarResposta(ticket.trim());
}
