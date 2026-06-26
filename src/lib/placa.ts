/** Normaliza placa para comparação (sem hífen, maiúsculas). */
export function compactPlaca(p: string): string {
  return String(p || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Formato exibido/cadastro: ABC-1D23 */
export function formatPlacaHyphen(p: string): string {
  const c = compactPlaca(p);
  if (c.length === 7) return `${c.slice(0, 3)}-${c.slice(3)}`;
  return c;
}

export function placasIguais(a: string, b: string): boolean {
  return compactPlaca(a) === compactPlaca(b);
}
