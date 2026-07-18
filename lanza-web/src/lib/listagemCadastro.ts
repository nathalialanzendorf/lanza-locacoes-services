const LOCALE = "pt-BR";

/** Cadastro Lanza: omitido ou true = ativo; só `false` = inativo. */
export function registroAtivo(ativo?: boolean): boolean {
  return ativo !== false;
}

export function ordenarAtivoDepoisAlfabetico<T>(
  items: readonly T[],
  opts: {
    ativoDe: (item: T) => boolean;
    rotuloDe: (item: T) => string;
  },
): T[] {
  return [...items].sort((a, b) => {
    const aAtivo = opts.ativoDe(a);
    const bAtivo = opts.ativoDe(b);
    if (aAtivo !== bAtivo) return aAtivo ? -1 : 1;
    return opts.rotuloDe(a).localeCompare(opts.rotuloDe(b), LOCALE, { sensitivity: "base" });
  });
}

export function rowClassInativo(ativo: boolean): string | undefined {
  return ativo ? undefined : "row--inativo";
}
