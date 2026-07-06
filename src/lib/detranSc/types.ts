/** Resposta bruta do DETRAN SC (campos flexíveis entre versões do portal). */
export type DetranScConsultaVeiculo = {
  placa?: string;
  renavam?: string;
  infracoes?: DetranScInfracao[];
  historicoInfracoes?: DetranScInfracao[];
  debitos?: DetranScDebito[];
  [key: string]: unknown;
};

export type DetranScInfracao = {
  idAutoInfracao?: number;
  numeroAuto?: string;
  numAuto?: string;
  autoInfracao?: string;
  descricao?: string;
  infracaoDescricao?: string;
  localComplemento?: string;
  localInfracao?: string;
  endereco?: string;
  data?: string;
  hora?: string;
  dataHoraAutuacao?: string;
  localDataHoraMulta?: string;
  dataAutuacao?: string;
  valor?: number | string;
  valorMulta?: number | string;
  situacao?: string;
  status?: string;
  protocolo?: string;
  limiteDefesa?: string;
  dataLimiteDefesa?: string;
  prazoDefesa?: string;
  prazoDefesaExpirado?: boolean;
  [key: string]: unknown;
};

export type DetranScDebito = {
  classe?: string;
  descricao?: string;
  tipo?: string;
  numeroAuto?: string;
  numAuto?: string;
  autoInfracao?: string;
  numeroDetranNET?: string;
  vencimento?: string;
  valorAtual?: number | string;
  valor?: number | string;
  exercicio?: number | string;
  [key: string]: unknown;
};

/** Status replicados do DETRAN SC (capitalização do portal). */
export type StatusInfracaoDetran = "Advertida" | "Paga" | "Notificada" | "Justificada";

export type DetranScMultaNormalizada = {
  autoInfracao: string;
  /** Igual a `autoInfracao` / `numeroAuto` do DETRAN — chave de vínculo autuação ↔ débito. */
  numeroAuto: string;
  descricao: string;
  localInfracao: string;
  dataAutuacao: string;
  valorMulta: number;
  situacao: string;
  /** Espelho legado — autuação: `dataLimiteDefesa`; débito: `dataVencimentoOriginal`. */
  limiteDefesa: string;
  /** Prazo de defesa da autuação (DD/MM/AAAA), bloco `infracoes`. */
  dataLimiteDefesa: string;
  /** Vencimento original do boleto (DD/MM/AAAA), bloco `debitos` — base de juros/multa. */
  dataVencimentoOriginal: string;
  /** true quando aparece em `debitos` ou após vencer `dataLimiteDefesa`. */
  convertidaEmDebito: boolean;
  quitadaDetran: boolean;
  /** Status bruto do DETRAN: Advertida | Paga | Notificada | Justificada. */
  statusInfracao: StatusInfracaoDetran;
  /**
   * Status semântico (minúsculas) para regras de cobrança: advertida | paga | justificada.
   * Ausente em Notificada (cobrável).
   */
  statusDetran?: string;
  fonte: "infracoes" | "debitos" | "historicoInfracoes";
};
