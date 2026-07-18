import { formatPlacaHyphen } from "./placa.js";

export type VeiculoLabelInput = {
  placa?: string | null;
  id?: string | null;
  marcaModelo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anoModelo?: string | null;
};

/** Rótulo padrão: PLACA · marca/modelo · ano (ex.: MKV-6268 · HYUNDAI/HB20 · 2012/2013). */
export function formatVeiculoLabel(v: VeiculoLabelInput): string {
  const placa = formatPlacaHyphen(String(v.placa ?? v.id ?? "").trim() || "—");
  const modelo =
    v.marcaModelo?.trim() ||
    [v.marca?.trim(), v.modelo?.trim()].filter(Boolean).join(" ").trim();
  const ano = v.anoModelo?.trim();
  const parts = [placa];
  if (modelo) parts.push(modelo);
  if (ano) parts.push(ano);
  return parts.join(" · ");
}
