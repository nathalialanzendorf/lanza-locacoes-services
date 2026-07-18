/** Opção vazia em combobox de filtro / consulta. */
export const SELECT_LABEL_TODOS = "---Todos---";

/** Opção vazia em combobox de cadastro / formulário. */
export const SELECT_LABEL_SELECIONAR = "--- Selecionar ---";

export type SelectEmptyVariant = "filtro" | "cadastro";

export function selectEmptyLabel(variant: SelectEmptyVariant = "cadastro"): string {
  return variant === "filtro" ? SELECT_LABEL_TODOS : SELECT_LABEL_SELECIONAR;
}
