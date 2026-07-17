/** Converte DD/MM/AAAA → YYYY-MM-DD (valor do input type=date). */
export function brToIsoDate(br: string): string {
  const t = br.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

/** Converte YYYY-MM-DD → DD/MM/AAAA. */
export function isoDateToBr(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;

  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${Number(d)}/${Number(mo)}/${y}`;
}

/** Normaliza qualquer data conhecida para o formato de armazenamento. */
export function normalizeDateValue(value: string, format: "br" | "iso"): string {
  if (!value.trim()) return "";
  return format === "iso" ? brToIsoDate(value) || value.trim() : isoDateToBr(value) || value.trim();
}
