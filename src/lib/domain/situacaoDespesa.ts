/** Texto descritivo em `situacao` (DETRAN, pedágio, etc.) — não confundir com `paga` (caixa Lanza). */
export const SituacaoDespesa = {
  EmAberto: "Em aberto",
  Pago: "Pago",
  Registrado: "Registrado",
  Notificada: "Notificada",
} as const;

export type SituacaoDespesaValor = (typeof SituacaoDespesa)[keyof typeof SituacaoDespesa];
