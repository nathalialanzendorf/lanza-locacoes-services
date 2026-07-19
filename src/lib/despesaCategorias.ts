/**
 * Constantes de categoria — sem imports para evitar ciclos ESM no cold start (Vercel).
 */

/** Categoria em cliente-despesas.json (débito de pedágio). */
export const CATEGORIA_PEDAGIO = "Pedágio";

/** Valor legado gravado como categoria — normalizar para `Pedágio`. */
export const CATEGORIA_PEDAGIO_ALIAS = "Pedágio Digital";

/** Categoria em cliente-despesas.json (débito de estacionamento rotativo). */
export const CATEGORIA_ESTACIONAMENTO = "Estacionamento";

/** Valores legados gravados como categoria — normalizar para `Estacionamento`. */
export const CATEGORIA_ESTACIONAMENTO_ALIASES = [
  "Estacionamento rotativo SigaPay",
  "SigaPay",
] as const;
