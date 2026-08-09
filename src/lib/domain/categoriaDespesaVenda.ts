import { CategoriaDespesaCliente } from "./categoriaDespesaCliente.js";

/** Categorias de recebíveis gerados a partir de vendas de veículos. */
export const CategoriaDespesaVenda = {
  Entrada: "Venda entrada",
  Parcela: "Venda parcela",
} as const;

export type CategoriaDespesaVendaValor =
  (typeof CategoriaDespesaVenda)[keyof typeof CategoriaDespesaVenda];

export const CATEGORIAS_DESPESA_VENDA: string[] = [
  CategoriaDespesaVenda.Entrada,
  CategoriaDespesaVenda.Parcela,
];

export function isCategoriaVenda(categoria: string | undefined | null): boolean {
  const c = String(categoria ?? "").trim().toLowerCase();
  return CATEGORIAS_DESPESA_VENDA.some((cat) => cat.toLowerCase() === c);
}

/** Prefixo estável em auto_infracao para despesas ligadas a uma venda. */
export function autoInfracaoPrefixoVenda(vendaId: string): string {
  return `VENDA-${vendaId.trim().replace(/-/g, "").toUpperCase()}`;
}

export function autoInfracaoEntradaVenda(vendaId: string): string {
  return `${autoInfracaoPrefixoVenda(vendaId)}-ENT`;
}

export function autoInfracaoParcelaVenda(vendaId: string, parcela: number): string {
  return `${autoInfracaoPrefixoVenda(vendaId)}-P${String(parcela).padStart(2, "0")}`;
}

/** Evita confundir com locação ao listar despesas do módulo venda. */
export function isCategoriaLocacaoOperacional(categoria: string | undefined | null): boolean {
  if (isCategoriaVenda(categoria)) return false;
  const c = String(categoria ?? "").trim();
  return c !== CategoriaDespesaCliente.QuebraContrato;
}
