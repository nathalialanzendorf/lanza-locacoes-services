/** Tipo interno de template WhatsApp / gerador de cobrança. */
export const TipoCobranca = {
  Semanal: "semanal",
  Estacionamento: "estacionamento",
  Pedagio: "pedagio",
  Multa: "multa",
  Renegociacao: "renegociacao",
  Manutencao: "manutencao",
} as const;

export type TipoCobrancaValor = (typeof TipoCobranca)[keyof typeof TipoCobranca];

/** Identificador de lote/ação na API e relatórios. */
export const TipoCobrancaAction = {
  PagamentoSemanal: "pagamento-semanal",
  Renegociacao: "renegociacao",
  Infracoes: "infracoes",
  Pedagio: "pedagio",
  EstacionamentoRotativo: "estacionamento-rotativo",
  Manutencao: "manutencao",
} as const;

export type TipoCobrancaActionValor =
  (typeof TipoCobrancaAction)[keyof typeof TipoCobrancaAction];

export const TIPOS_COBRANCA_ACTION = Object.values(TipoCobrancaAction);

export const RotuloTipoCobrancaAction = {
  [TipoCobrancaAction.PagamentoSemanal]: "Pagamento semanal",
  [TipoCobrancaAction.Renegociacao]: "Renegociação",
  [TipoCobrancaAction.Infracoes]: "Infrações",
  [TipoCobrancaAction.Pedagio]: "Pedágio Digital",
  [TipoCobrancaAction.EstacionamentoRotativo]: "Estacionamento rotativo",
  [TipoCobrancaAction.Manutencao]: "Manutenção",
} as const satisfies Record<TipoCobrancaActionValor, string>;

export const MAPA_ACTION_PARA_TIPO: Record<TipoCobrancaActionValor, TipoCobrancaValor> = {
  [TipoCobrancaAction.PagamentoSemanal]: TipoCobranca.Semanal,
  [TipoCobrancaAction.Renegociacao]: TipoCobranca.Renegociacao,
  [TipoCobrancaAction.Infracoes]: TipoCobranca.Multa,
  [TipoCobrancaAction.Pedagio]: TipoCobranca.Pedagio,
  [TipoCobrancaAction.EstacionamentoRotativo]: TipoCobranca.Estacionamento,
  [TipoCobrancaAction.Manutencao]: TipoCobranca.Manutencao,
};

export function rotuloTipoCobrancaAction(tipo: TipoCobrancaActionValor): string {
  return RotuloTipoCobrancaAction[tipo];
}

export function tipoCobrancaDeAction(action: TipoCobrancaActionValor): TipoCobrancaValor {
  return MAPA_ACTION_PARA_TIPO[action];
}
