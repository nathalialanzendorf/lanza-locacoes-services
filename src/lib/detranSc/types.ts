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
  localDataHoraMulta?: string;
  dataAutuacao?: string;
  valor?: number | string;
  valorMulta?: number | string;
  situacao?: string;
  status?: string;
  limiteDefesa?: string;
  dataLimiteDefesa?: string;
  prazoDefesa?: string;
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

export type DetranScMultaNormalizada = {
  autoInfracao: string;
  descricao: string;
  localInfracao: string;
  dataAutuacao: string;
  valorMulta: number;
  situacao: string;
  limiteDefesa: string;
  quitadaDetran: boolean;
  fonte: "infracoes" | "debitos" | "historicoInfracoes";
};
