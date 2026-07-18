import { apiRequest } from "./client";
import { lanzaApiExtra } from "./endpointsExtra";
import type {
  Cliente,
  ClienteDespesa,
  CobrancasMeta,
  Contrato,
  DataEnvelope,
  Health,
  Infracao,
  ListEnvelope,
  Locacao,
  Parceiro,
  ParceiroDespesa,
  PlanoBaixa,
  RenegociacaoInput,
  RenegociacaoPreview,
  RenegociacaoResumo,
  Resumo,
  SyncJob,
  SyncMeta,
  Veiculo,
  VinculoParceiro,
} from "./types";

export const lanzaApi = {
  ...lanzaApiExtra,
  health: () => apiRequest<Health>("/health"),
  resumo: () => apiRequest<Resumo>("/api/resumo"),

  listarClientes: (ativo?: boolean) =>
    apiRequest<ListEnvelope<Cliente>>("/api/clientes", {
      params: ativo === undefined ? undefined : { ativo },
    }),
  obterCliente: (id: string) =>
    apiRequest<DataEnvelope<Cliente>>(`/api/clientes/${encodeURIComponent(id)}`),

  listarVeiculos: (params?: { ativo?: boolean; placa?: string }) =>
    apiRequest<ListEnvelope<Veiculo>>("/api/veiculos", { params }),
  criarVeiculo: (body: {
    placa: string;
    marcaModelo?: string;
    anoModelo?: string;
    chassi?: string;
    renavam?: string;
    cor?: string;
    ativo?: boolean;
    parceiroNome?: string;
    parceiroId?: string;
    ufRegistro?: string;
    origem?: string;
  }) => apiRequest<{ data: Veiculo; acao: string }>("/api/veiculos", { method: "POST", body }),
  atualizarVeiculo: (id: string, patch: Record<string, unknown>) =>
    apiRequest<DataEnvelope<Veiculo>>(`/api/veiculos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    }),

  listarContratos: (params?: {
    status?: "ativo" | "encerrado";
    clienteId?: string;
    veiculoId?: string;
    placa?: string;
    dataInicial?: string;
    dataFinal?: string;
  }) => apiRequest<ListEnvelope<Contrato>>("/api/contratos", { params }),
  criarContrato: (body: Record<string, unknown>) =>
    apiRequest<{ data: unknown }>("/api/contratos/criar", { method: "POST", body }),
  renovarContrato: (body: Record<string, unknown>) =>
    apiRequest<{ data: unknown }>("/api/contratos/renovar", { method: "POST", body }),
  encerrarContrato: (body: {
    idOuPasta: string;
    dataEncerramento: string;
    motivoEncerramento: string;
    quebraContrato?: boolean;
  }) => apiRequest<{ data: unknown }>("/api/contratos/encerrar", { method: "POST", body }),

  listarDespesasCliente: (params?: {
    emAberto?: boolean;
    ativo?: boolean;
    clienteId?: string;
    veiculoId?: string;
    placa?: string;
    categoria?: string;
    competencia?: string;
  }) => apiRequest<ListEnvelope<ClienteDespesa>>("/api/despesas", { params }),

  listarDespesasParceiro: (params?: {
    emAberto?: boolean;
    ativo?: boolean;
    parceiroId?: string;
    veiculoId?: string;
    placa?: string;
    categoria?: string;
    competencia?: string;
  }) => apiRequest<ListEnvelope<ParceiroDespesa>>("/api/parceiro-despesas", { params }),

  listarLocacoes: (params?: {
    abertas?: boolean;
    placa?: string;
    situacao?: string;
    clienteId?: string;
    dataInicial?: string;
    dataFinal?: string;
  }) => apiRequest<ListEnvelope<Locacao>>("/api/locacoes", { params }),
  salvarLocacao: (body: Record<string, unknown>) =>
    apiRequest<{ data: Locacao }>("/api/locacoes", { method: "POST", body }),
  removerLocacao: (id: string) =>
    apiRequest<{ data: Locacao }>(`/api/locacoes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  sugerirLocacoesPrestacao: (body: { competencia: string; placa?: string }) =>
    apiRequest<{ data: import("./types").PrestacaoSugestaoLocacoes }>("/api/locacoes/sugerir", {
      method: "POST",
      body,
    }),

  listarParceiros: (params?: { ativo?: boolean }) =>
    apiRequest<ListEnvelope<Parceiro>>("/api/parceiros", { params }),
  obterParceiro: (id: string) =>
    apiRequest<DataEnvelope<Parceiro>>(`/api/parceiros/${encodeURIComponent(id)}`),
  listarVinculosParceiro: (params?: { veiculoId?: string; parceiroId?: string }) =>
    apiRequest<ListEnvelope<VinculoParceiro>>("/api/parceiros/vinculos", { params }),

  listarInfracoes: (params?: {
    placa?: string;
    veiculoId?: string;
    clienteId?: string;
    parceiroId?: string;
    dataInicial?: string;
    dataFinal?: string;
    emAberto?: boolean;
    semCliente?: boolean;
    ativo?: boolean;
  }) => apiRequest<ListEnvelope<Infracao>>("/api/infracoes", { params }),

  metaCobrancas: () => apiRequest<CobrancasMeta>("/api/relatorios/cobrancas/meta"),
  gerarCobrancas: (body: Record<string, unknown>) =>
    apiRequest<{ data: unknown }>("/api/relatorios/cobrancas", { method: "POST", body }),
  gerarPrestacaoContas: (body: Record<string, unknown>) =>
    apiRequest<{ data: unknown }>("/api/relatorios/prestacao-contas", { method: "POST", body }),
  gerarEncerramento: (body: Record<string, unknown>) =>
    apiRequest<{
      data: unknown;
      whatsapp?: string;
      texto?: string;
      avisos?: string[];
      arquivos?: unknown;
    }>("/api/relatorios/encerramento", { method: "POST", body }),

  montarPlanoRecebimento: (body: {
    clienteQuery: string;
    valor: number;
    dataBr: string;
    placa?: string;
  }) => apiRequest<{ data: PlanoBaixa }>("/api/recebimentos/plano", { method: "POST", body }),
  executarRecebimento: (body: { linhas: PlanoBaixa["linhas"]; syncRastreame?: boolean }) =>
    apiRequest<{ data: unknown }>("/api/recebimentos/executar", { method: "POST", body }),

  metaSync: () => apiRequest<SyncMeta>("/api/sync"),
  listarSyncJobs: (limit = 20) =>
    apiRequest<{ total: number; jobs: SyncJob[] }>("/api/sync/jobs", { params: { limit } }),
  obterSyncJob: (id: string) => apiRequest<SyncJob>(`/api/sync/jobs/${encodeURIComponent(id)}`),
  executarSync: (
    nome: string,
    body: Record<string, unknown> = {},
    opts?: { async?: boolean },
  ) =>
    apiRequest<{ jobId?: string; status?: string; sync?: string; data?: unknown }>(
      `/api/sync/${encodeURIComponent(nome)}`,
      { method: "POST", body: { ...body, async: opts?.async ?? body.async }, params: opts?.async ? { async: true } : undefined },
    ),
  executarSyncCompleto: (body: Record<string, unknown> = {}, opts?: { async?: boolean }) =>
    apiRequest<{ jobId?: string; status?: string; data?: unknown }>("/api/sync/completo", {
      method: "POST",
      body: { ...body, async: opts?.async ?? body.async },
      params: opts?.async ? { async: true } : undefined,
    }),

  resumoRenegociacao: (params: {
    clienteId?: string;
    placa?: string;
    motoristaKey?: string;
    rastreavelKey?: string;
    apenasVencidos?: boolean;
  }) => apiRequest<RenegociacaoResumo>("/api/renegociacao/resumo", { params }),
  previewRenegociacao: (body: RenegociacaoInput) =>
    apiRequest<RenegociacaoPreview>("/api/renegociacao/preview", { method: "POST", body }),
  executarRenegociacao: (body: RenegociacaoInput) =>
    apiRequest<{ preview: RenegociacaoPreview; resultado: unknown; executado: boolean }>(
      "/api/renegociacao/executar",
      { method: "POST", body },
    ),
};
