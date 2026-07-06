import type { DetranScConsultaVeiculo, DetranScInfracao } from "./types.js";

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function autoKey(item: DetranScInfracao | Record<string, unknown>): string {
  return pickStr(item as Record<string, unknown>, [
    "numeroAuto",
    "numAuto",
    "autoInfracao",
    "numeroAutoInfracao",
    "auto",
  ]).toUpperCase();
}

function unwrapPayload(raw: unknown): DetranScConsultaVeiculo {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const nested = [o.data, o.veiculo, o.resultado, o.payload, o.content].find(
    (x) => x && typeof x === "object",
  ) as DetranScConsultaVeiculo | undefined;
  if (nested && (nested.infracoes || nested.historicoInfracoes || nested.debitos)) {
    return nested;
  }
  return o as DetranScConsultaVeiculo;
}

/** Índice autoInfracao (uppercase) → objeto bruto DETRAN (para PDF e campos extras). */
export function indexarRawInfracoesDetranSc(raw: unknown): Map<string, DetranScInfracao> {
  const payload = unwrapPayload(raw);
  const map = new Map<string, DetranScInfracao>();

  for (const list of [
    payload.infracoes ?? [],
    payload.debitos ?? [],
    payload.historicoInfracoes ?? [],
  ]) {
    for (const item of list) {
      const key = autoKey(item);
      if (key && !map.has(key)) map.set(key, item);
    }
  }

  return map;
}
