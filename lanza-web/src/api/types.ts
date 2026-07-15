export type Resumo = {
  clientes: { total: number; ativos: number };
  veiculos: { total: number; ativos: number };
  contratos: { total: number; ativos: number };
  despesasCliente: { emAberto: number; valorEmAberto: number };
  despesasParceiro: { emAberto: number; valorEmAberto: number };
  infracoes: { emAberto: number; semCondutor: number };
  locacoes: { abertas: number };
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
  cnh?: string;
  ativo?: boolean;
  analiseCadastro?: { aprovado?: boolean | null; dataConsulta?: string };
};

export type Veiculo = {
  id: string;
  placa?: string;
  marcaModelo?: string;
  ativo?: boolean;
  ufRegistro?: string;
  clienteVinculadoId?: string | null;
};

export type Contrato = {
  id: string;
  status?: string;
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  pasta?: string;
  dataInicio?: string;
  dataFim?: string;
};

export type ClienteDespesa = {
  id: string;
  clienteId?: string;
  placa?: string;
  categoria?: string;
  descricao?: string;
  valorMulta?: number;
  paga?: boolean;
  ativo?: boolean;
};

export type Locacao = {
  id: string;
  tipo?: string;
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  inicio?: string;
  fim?: string | null;
};

export type Health = {
  status: string;
  service: string;
  version: string;
};

export type ApiError = {
  error: string;
};
