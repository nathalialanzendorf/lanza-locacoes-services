/** Texto gravado em `situacao` (controle interno / DETRAN). */
export const SituacaoDespesa = {
  EmAberto: "Em aberto",
  Pago: "Pago",
  Registrado: "Registrado",
  Notificada: "Notificada",
} as const;

export type SituacaoDespesaValor = (typeof SituacaoDespesa)[keyof typeof SituacaoDespesa];
