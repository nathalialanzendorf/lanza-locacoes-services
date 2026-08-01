import { SituacaoDespesa, type SituacaoDespesaValor } from "./situacaoDespesa.js";
import { hojeBr, pagaEmInputToIso } from "../dataBr.js";

/** Valor interno de filtro/cadastro (UI). */
export const StatusDespesaFiltro = {
  EmAberto: "em_aberto",
  Pago: "pago",
  Todos: "todos",
} as const;

export type StatusDespesaFiltroValor =
  (typeof StatusDespesaFiltro)[keyof typeof StatusDespesaFiltro];

export type StatusDespesaCadastro =
  | typeof StatusDespesaFiltro.EmAberto
  | typeof StatusDespesaFiltro.Pago;

export function camposStatusDespesaDeCadastro(
  status: StatusDespesaCadastro,
  pagaEmAtual?: string | null,
): { paga: boolean; situacao: SituacaoDespesaValor; pagaEm: string | null } {
  if (status === StatusDespesaFiltro.Pago) {
    const br = pagaEmAtual?.trim() || hojeBr();
    return {
      paga: true,
      situacao: SituacaoDespesa.Pago,
      pagaEm: pagaEmInputToIso(br),
    };
  }
  return { paga: false, situacao: SituacaoDespesa.EmAberto, pagaEm: null };
}
