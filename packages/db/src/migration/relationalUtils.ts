/** Normaliza placa para comparação (sem hífen, maiúsculas). */
export function compactPlaca(p: string): string {
  return String(p || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatPlacaHyphen(p: string): string {
  const c = compactPlaca(p);
  if (c.length === 7) return `${c.slice(0, 3)}-${c.slice(3)}`;
  return c;
}

export function normCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function parseIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function asBool(value: unknown, defaultValue = false): boolean {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return defaultValue;
}

export function asNumber(value: unknown, defaultValue = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return defaultValue;
}

export function asText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}
