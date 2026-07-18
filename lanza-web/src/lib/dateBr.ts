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
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return t;
    const [, d, mo, y] = m;
    return `${d!.padStart(2, "0")}/${mo!.padStart(2, "0")}/${y}`;
  }

  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d!.padStart(2, "0")}/${mo!.padStart(2, "0")}/${y}`;
}

/** Máscara incremental DD/MM/AAAA enquanto o utilizador digita. */
export function maskDateBrInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Valor armazenado → texto de exibição DD/MM/AAAA. */
export function dateValueToDisplay(value: string, format: "br" | "iso" = "br"): string {
  const t = value.trim();
  if (!t) return "";
  if (format === "iso" || /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const br = isoDateToBr(t);
    if (br) return br;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return isoDateToBr(brToIsoDate(t)) || t;
  return maskDateBrInput(t);
}

/** Normaliza qualquer data conhecida para o formato de armazenamento. */
export function normalizeDateValue(value: string, format: "br" | "iso"): string {
  if (!value.trim()) return "";
  return format === "iso" ? brToIsoDate(value) || value.trim() : isoDateToBr(value) || value.trim();
}
