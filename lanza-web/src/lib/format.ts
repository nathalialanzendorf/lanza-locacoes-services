export function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPlaca(placa?: string): string {
  if (!placa) return "—";
  const raw = placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length === 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return placa;
}

export function statusLabel(ativo?: boolean): string {
  if (ativo === false) return "Inativo";
  if (ativo === true) return "Ativo";
  return "—";
}

export function statusClass(ativo?: boolean): string {
  if (ativo === false) return "badge badge--muted";
  if (ativo === true) return "badge badge--ok";
  return "badge";
}
