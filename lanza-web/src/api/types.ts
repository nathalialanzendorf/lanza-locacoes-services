export type Resumo = {
  clientes: { total: number; ativos: number };
  veiculos: { total: number; ativos: number; locados: number; naoLocados: number };
  contratos: { total: number; ativos: number };
  despesasCliente: { emAberto: number; valorEmAberto: number };
  despesasParceiro: { emAberto: number; valorEmAberto: number };
  infracoes: { emAberto: number; comVencimento: number; semCliente: number; semCondutor?: number };
  recebimentos?: DashboardRecebimentos;
};

export type DashboardRecebimentoLinha = {
  clienteId: string | null;
  clienteNome: string | null;
  placa: string;
  veiculo: string;
  valor: number;
  vencimentoBr?: string | null;
  vencimentosBr?: string[];
  diasAtraso?: number | null;
};

export type DashboardRecebimentosTotais = {
  venceHoje: number;
  atrasado: number;
  semanal: number;
  caucao: number;
  renegociacao: number;
};

export type DashboardRecebimentos = {
  dataReferenciaBr: string;
  tituloPagamentoSemanal?: string;
  venceHoje: DashboardRecebimentoLinha[];
  atrasados: DashboardRecebimentoLinha[];
  totais: DashboardRecebimentosTotais;
};

export type ListEnvelope<T> = {
  total: number;
  items: T[];
};

export type DataEnvelope<T> = {
  data: T;
};

export type Cliente = {
  id: string;
  nome?: string;
  cpf?: string;
  cnh?: string | { numeroRegistro?: string; categoria?: string; validade?: string };
  contato?: string;
  telefone?: string;
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
  };
  ativo?: boolean;
  rastreameMotoristaKey?: string | number | null;
  analiseCadastro?: { aprovado?: boolean | null; dataConsulta?: string };
};

export type Veiculo = {
  id: string;
  placa?: string;
  marcaModelo?: string;
  marca?: string;
  modelo?: string;
  anoModelo?: string;
  chassi?: string;
  renavam?: string;
  cor?: string;
  parceiroNome?: string;
  ativo?: boolean;
  ufRegistro?: string;
  clienteVinculadoId?: string | null;
  rastreameRastreavelKey?: string | number | null;
};

export type ContratoVeiculoSnapshot = {
  id?: string | null;
  placa?: string;
  marcaModelo?: string | null;
  anoModelo?: string | null;
};

export type Contrato = {
  id: string;
  status?: string;
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  pasta?: string;
  pastaContrato?: string;
  clienteNome?: string;
  veiculo?: ContratoVeiculoSnapshot;
  dataInicio?: string;
  dataFim?: string;
  dataFimPrevista?: string;
  dataEncerramento?: string | null;
  cpf?: string | null;
  tipoContrato?: string | null;
  valorSemanal?: number | null;
  valorMensal?: number | null;
  valorDiaria?: number | null;
};

/** Resposta completa de GET /api/contratos/:id */
export type ContratoDetalhe = Contrato & {
  pastaContrato?: string;
  cpf?: string | null;
  clienteNome?: string;
  dataFimPrevista?: string;
  dataEncerramento?: string | null;
};

export type ClienteDespesa = {
  id: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
  descricao?: string;
  valorMulta?: number;
  paga?: boolean;
  ativo?: boolean;
  situacao?: string;
  autoInfracao?: string;
  /** Cliente responsável (API legada: condutorId) */
  clienteId?: string | null;
  condutorId?: string | null;
  clienteConfirmado?: boolean;
  condutorConfirmado?: boolean;
  rastreameId?: string | number | null;
};

export type AnaliseCadastroItem = {
  id: string;
  cpf?: string;
  nome?: string;
  dataConsulta?: string;
  alertaGeral?: boolean;
  resumo?: string;
  aprovado?: boolean | null;
};

export type PagBankPlano = {
  pagbank: { id: string; valor: number; dataBr: string; descricao: string; nomePagador?: string | null };
  clienteQuery: string;
  confianca: string;
  motivo: string;
  revisaoManual: boolean;
  jaBaixado?: boolean;
  plano: PlanoBaixa;
};

export type PagBankLote = {
  intervalo: { initialDate: string; finalDate: string };
  planos: PagBankPlano[];
  semMatch: unknown[];
  totalCreditos?: number;
};

export type PrestacaoVeiculoInput = {
  placa: string;
  ganho?: { valor: number; descricao?: string; itens?: { descricao: string; valor: number }[] };
  devidoMesAnterior?: number;
  descontoManutencao?: {
    valor: number;
    descricao?: string;
    itens?: { descricao: string; valor: number }[];
  };
};

export type PrestacaoSugestaoVeiculo = {
  placa: string;
  veiculoId?: string;
  ganhoItens?: { descricao: string; valor: number }[];
  manutencaoItens?: { descricao: string; valor: number }[];
  locado?: { repasseParceiro?: number };
};

export type PrestacaoSugestaoLocacoes = {
  competencia: string;
  periodo: { inicio: string; fim: string };
  veiculos: PrestacaoSugestaoVeiculo[];
};

export type ParceiroDespesa = {
  id: string;
  veiculoId?: string | null;
  placa?: string;
  categoria?: string;
  descricao?: string;
  data?: string;
  valor?: number;
  competencia?: string;
  baixa?: string;
};

export type Infracao = {
  id: string;
  numeroAuto: string;
  veiculoId?: string;
  descricao?: string;
  dataAutuacao?: string;
  localInfracao?: string;
  valor?: number;
  valorMulta?: number;
  situacao?: string;
  status?: string;
  limiteDefesa?: string;
  dataLimiteDefesa?: string;
  quitadaDetran?: boolean;
  /** Cliente responsável (API legada: condutorId) */
  clienteId?: string | null;
  condutorId?: string | null;
  clienteConfirmado?: boolean;
  condutorConfirmado?: boolean;
  clienteNaoIdentificado?: boolean;
  condutorNaoIdentificado?: boolean;
  debitoParceiroConfirmado?: boolean;
  revisarManual?: boolean;
  clienteDespesaId?: string | null;
  ativo?: boolean;
};

export type Locacao = {
  id: string;
  tipo?: string;
  situacao?: string;
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  inicio?: string;
  fim?: string | null;
  clienteNome?: string | null;
  condutorNome?: string | null;
  tipoLocacao?: string | null;
  observacao?: string | null;
};

export type CobrancaTipo = {
  id: string;
  rotulo: string;
};

export type CobrancasMeta = {
  tipos: CobrancaTipo[];
  modosPlaca: string[];
  outDirPadrao: string;
};

export type LinhaPlanoBaixa = {
  num: number;
  operacao: string;
  rastreavel: string;
  autoInfracao: string | null;
  descricao?: string;
  total?: number;
  patch?: Record<string, unknown>;
};

export type PlanoBaixa = {
  cliente: { id: string; nome: string; cpf?: string | null };
  pagamento?: { valor: number; dataBr: string };
  despesaAlvo?: {
    autoInfracao: string;
    descricaoAtual: string;
    valorDevido: number;
    dataVencimento: string;
  } | null;
  tipoBaixa?: "integral" | "parcial" | "integral_desconto";
  avisos?: string[];
  linhas: LinhaPlanoBaixa[];
};

export type Parceiro = {
  id: string;
  nome: string;
  ativo?: boolean;
};

export type VinculoParceiro = {
  id: string;
  veiculoId: string;
  parceiroId: string;
};

export type RastreameEspelhoConfig = {
  ativo: boolean;
  origem: "env" | "config" | "default";
  editavelViaApi: boolean;
};

export type Health = {
  status: "ok" | "degraded";
  service: string;
  version: string;
  apiUrl?: string;
  frontendUrl?: string;
  database?: {
    backend: string;
    postgres?: { ok: boolean; error?: string };
  };
  rastreameEspelho?: RastreameEspelhoConfig;
};

export type ApiError = {
  error: string;
};

export type SyncDirecao = "buscar" | "enviar";

export type SyncCatalogEntry = {
  id: string;
  rotulo: string;
  destino: string;
  interativo: boolean;
  direcao?: SyncDirecao;
  nota?: string;
};

export type SyncMeta = {
  syncs: SyncCatalogEntry[];
  ordemCompleto: string[];
};

export type SyncJob = {
  id: string;
  sync: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  input?: unknown;
  result?: unknown;
  error?: string;
};

export type RenegociacaoDebito = {
  id: string | number;
  info: string;
  total: number;
  data?: string;
  tipo?: string;
};

export type RenegociacaoResumo = {
  motoristaKey: string;
  rastreavelKey: string;
  clienteId?: string;
  placa?: string;
  total: number;
  soma: number;
  debitos: RenegociacaoDebito[];
  gastosIds: Array<string | number>;
  apenasVencidos?: boolean;
};

export type RenegociacaoParcela = {
  numero: number;
  totalParcelas: number;
  valor: number;
  data: string;
};

export type RenegociacaoInput = {
  negociacaoCodigo: string;
  gastosIds: Array<string | number>;
  motoristaKey: string;
  rastreavelKey: string;
  parcelas: RenegociacaoParcela[];
};

export type RenegociacaoPreview = {
  debitos: Array<{ id: string | number; total: number; info: string }>;
  totalDebitos: number;
  parcelas: RenegociacaoParcela[];
  validacao: { ok: boolean; soma: number; diff: number };
};
