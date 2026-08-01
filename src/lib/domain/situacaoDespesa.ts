/** Texto descritivo em `situacao` (DETRAN, pedágio, etc.) — não confundir com `paga` / `statusCobranca` (caixa Lanza). */
export const SituacaoDespesa = {
  EmAberto: "Em aberto",
  Pago: "Pago",
  Baixado: "Baixado",
  Registrado: "Registrado",
  Notificada: "Notificada",
} as const;

export type SituacaoDespesaValor = (typeof SituacaoDespesa)[keyof typeof SituacaoDespesa];
