/** Categoria gravada em `locacoes.situacao` (locado, reserva, manutenção). */
export const CategoriaMovimentacao = {
  Locado: "locado",
  Reserva: "reserva",
  Manutencao: "manutencao",
} as const;

export type CategoriaMovimentacaoValor =
  (typeof CategoriaMovimentacao)[keyof typeof CategoriaMovimentacao];

export const CATEGORIAS_MOVIMENTACAO_VALIDAS = new Set<string>(
  Object.values(CategoriaMovimentacao),
);

export function isCategoriaMovimentacaoValor(
  raw: string | null | undefined,
): raw is CategoriaMovimentacaoValor {
  return CATEGORIAS_MOVIMENTACAO_VALIDAS.has(String(raw ?? "").trim());
}

/** @deprecated Use {@link CategoriaMovimentacao}. */
export const SituacaoLocacao = CategoriaMovimentacao;

/** @deprecated Use {@link CategoriaMovimentacaoValor}. */
export type SituacaoLocacaoValor = CategoriaMovimentacaoValor;

/** @deprecated Use {@link CATEGORIAS_MOVIMENTACAO_VALIDAS}. */
export const SITUACOES_LOCACAO_VALIDAS = CATEGORIAS_MOVIMENTACAO_VALIDAS;

/** @deprecated Use {@link isCategoriaMovimentacaoValor}. */
export const isSituacaoLocacaoValor = isCategoriaMovimentacaoValor;

/** @deprecated Prefer {@link isCategoriaMovimentacaoValor}. */
export function situacaoLocacaoValida(raw: string): raw is CategoriaMovimentacaoValor {
  return isCategoriaMovimentacaoValor(raw);
}
