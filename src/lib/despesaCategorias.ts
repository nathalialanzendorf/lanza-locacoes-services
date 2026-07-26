/**
 * Constantes de categoria — reexporta domínio canônico (sem ciclos ESM no cold start).
 */
export {
  CategoriaDespesaCliente,
  CATEGORIA_PEDAGIO_ALIAS,
  CATEGORIAS_ESTACIONAMENTO_ALIAS,
} from "./domain/categoriaDespesaCliente.js";

import { CategoriaDespesaCliente, CATEGORIAS_ESTACIONAMENTO_ALIAS } from "./domain/categoriaDespesaCliente.js";

/** Categoria em cliente-despesas.json (débito de pedágio). */
export const CATEGORIA_PEDAGIO = CategoriaDespesaCliente.Pedagio;

/** Categoria em cliente-despesas.json (débito de estacionamento rotativo). */
export const CATEGORIA_ESTACIONAMENTO = CategoriaDespesaCliente.Estacionamento;

/** @deprecated Use {@link CATEGORIAS_ESTACIONAMENTO_ALIAS}. */
export const CATEGORIA_ESTACIONAMENTO_ALIASES = CATEGORIAS_ESTACIONAMENTO_ALIAS;
