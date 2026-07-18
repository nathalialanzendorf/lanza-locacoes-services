import { apiRequest } from "./client";
import type {
  AnaliseCadastroItem,
  Cliente,
  ClienteDespesa,
  DataEnvelope,
  Infracao,
  ListEnvelope,
  Locacao,
  PagBankLote,
} from "./types";

/** Endpoints adicionais — importados em endpoints.ts */
export const lanzaApiExtra = {
  criarCliente: (body: Record<string, unknown>) =>
    apiRequest<{ data: Cliente; acao: string }>("/api/clientes", { method: "POST", body }),
  atualizarCliente: (id: string, patch: Record<string, unknown>) =>
    apiRequest<DataEnvelope<Cliente>>(`/api/clientes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    }),
  removerCliente: (id: string) =>
    apiRequest<DataEnvelope<Cliente>>(`/api/clientes/${encodeURIComponent(id)}`, { method: "DELETE" }),

  obterVeiculo: (id: string) =>
    apiRequest<DataEnvelope<Veiculo>>(`/api/veiculos/${encodeURIComponent(id)}`),
  removerVeiculo: (id: string) =>
    apiRequest<DataEnvelope<Veiculo>>(`/api/veiculos/${encodeURIComponent(id)}`, { method: "DELETE" }),
  consultarFipe: (body: {
    placa: string;
    marcaModelo?: string;
    anoModelo?: string;
    persist?: boolean;
  }) => apiRequest<unknown>("/api/fipe/consultar", { method: "POST", body }),
  atualizarFipeVeiculo: (placa: string) =>
    apiRequest<unknown>("/api/fipe/atualizar-veiculo", { method: "POST", body: { placa } }),
  importarCrlv: (body: Record<string, unknown> = {}) =>
    apiRequest<{ data: unknown }>("/api/importacoes/crlv", { method: "POST", body }),

  previewImportacaoCnh: (raiz?: string) =>
    apiRequest<{ total: number; pastas: unknown[]; raiz: string }>("/api/importacoes/cnh/preview", {
      params: raiz ? { raiz } : undefined,
    }),
  importarCnh: (body: { raiz?: string; dryRun?: boolean; comRastreame?: boolean }) =>
    apiRequest<{ data: unknown }>("/api/importacoes/cnh", { method: "POST", body }),

  lerDocumento: (body: { tipo: string; nomeArquivo: string; conteudoBase64: string }) =>
    apiRequest<{
      data: {
        tipo: string;
        campos: Record<string, unknown>;
        avisos: string[];
        textoChars: number;
      };
    }>("/api/importacoes/documento/ler", { method: "POST", body }),

  criarParceiro: (nome: string) =>
    apiRequest<{ data: import("./types").Parceiro }>("/api/parceiros", {
      method: "POST",
      body: { nome },
    }),
  atualizarParceiro: (id: string, nome: string) =>
    apiRequest<DataEnvelope<import("./types").Parceiro>>(`/api/parceiros/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { nome },
    }),
  removerParceiro: (id: string) =>
    apiRequest<DataEnvelope<import("./types").Parceiro>>(`/api/parceiros/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  configRastreameEspelho: () =>
    apiRequest<import("./types").RastreameEspelhoConfig>("/api/config/rastreame-espelho"),
  atualizarRastreameEspelho: (ativo: boolean) =>
    apiRequest<import("./types").RastreameEspelhoConfig>("/api/config/rastreame-espelho", {
      method: "PATCH",
      body: { ativo },
    }),

  obterDespesaCliente: (id: string) =>
    apiRequest<DataEnvelope<ClienteDespesa>>(`/api/despesas/${encodeURIComponent(id)}`),
  criarDespesaCliente: (veiculoId: string, despesa: Record<string, unknown>, syncRastreame?: boolean) =>
    apiRequest<{ data: ClienteDespesa }>("/api/despesas", {
      method: "POST",
      body: { veiculoId, despesa, syncRastreame },
    }),
  atualizarDespesaCliente: (id: string, patch: Record<string, unknown>, syncRastreame?: boolean) =>
    apiRequest<{ data: ClienteDespesa }>(`/api/despesas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { ...patch, syncRastreame },
    }),
  removerDespesaCliente: (id: string, syncRastreame?: boolean) =>
    apiRequest<{ data: ClienteDespesa }>(`/api/despesas/${encodeURIComponent(id)}`, {
      method: "DELETE",
      params: syncRastreame === undefined ? undefined : { syncRastreame },
    }),
  confirmarClienteDespesa: (id: string, clienteId: string | null, syncRastreame?: boolean) =>
    apiRequest<{ data: ClienteDespesa }>(`/api/despesas/${encodeURIComponent(id)}/confirmar-cliente`, {
      method: "POST",
      body: { clienteId, syncRastreame },
    }),

  criarDespesaParceiro: (body: Record<string, unknown>) =>
    apiRequest<{ data: unknown }>("/api/parceiro-despesas", { method: "POST", body }),
  baixaDespesaParceiro: (body: {
    id?: string;
    placa?: string;
    categoria?: string;
    competencia?: string;
    data?: string;
    desfazer?: boolean;
  }) => apiRequest<{ data: unknown }>("/api/parceiro-despesas/baixa", { method: "POST", body }),
  lancarRastreadorParceiro: (body: { desde?: string; ate?: string; dryRun?: boolean }) =>
    apiRequest<{ data: unknown }>("/api/parceiro-despesas/rastreador", { method: "POST", body }),

  obterLocacao: (id: string) =>
    apiRequest<DataEnvelope<Locacao>>(`/api/locacoes/${encodeURIComponent(id)}`),
  atualizarLocacao: (id: string, patch: Record<string, unknown>) =>
    apiRequest<{ data: Locacao }>(`/api/locacoes/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  removerLocacao: (id: string) =>
    apiRequest<{ data: Locacao }>(`/api/locacoes/${encodeURIComponent(id)}`, { method: "DELETE" }),

  atribuirClientesInfracoes: (body: { dryRun?: boolean; placa?: string; prazoDias?: number }) =>
    apiRequest<{ data: unknown }>("/api/infracoes/atribuir-clientes", { method: "POST", body }),
  confirmarParceiroInfracao: (numeroAuto: string, parceiroId?: string | null) =>
    apiRequest<{ data: Infracao }>(`/api/infracoes/${encodeURIComponent(numeroAuto)}/confirmar-parceiro`, {
      method: "POST",
      body: { parceiroId },
    }),

  listarAnalisesCadastro: (params?: { cpf?: string; comAlerta?: boolean }) =>
    apiRequest<ListEnvelope<AnaliseCadastroItem>>("/api/analise-cadastro", { params }),
  executarAnaliseCadastro: (body: Record<string, unknown>, asyncMode = true) =>
    apiRequest<{ jobId?: string; data?: unknown }>("/api/analise-cadastro", {
      method: "POST",
      body,
      params: asyncMode ? { async: true } : undefined,
    }),
  decisaoAnaliseCadastro: (id: string, aprovado: boolean) =>
    apiRequest<{ data: unknown }>(`/api/analise-cadastro/${encodeURIComponent(id)}/decisao`, {
      method: "PATCH",
      body: { aprovado },
    }),
  obterAnaliseJob: (id: string) =>
    apiRequest<import("./types").SyncJob>(`/api/analise-cadastro/jobs/${encodeURIComponent(id)}`),

  pagbankStatus: () =>
    apiRequest<{ configurado: boolean; ok: boolean; creditos?: unknown }>("/api/pagbank/check"),
  pagbankMatch: (params?: { inicio?: string; fim?: string }) =>
    apiRequest<PagBankLote>("/api/pagbank/match", { params }),
  pagbankMatchPost: (body: { inicio?: string; fim?: string }) =>
    apiRequest<PagBankLote>("/api/pagbank/match", { method: "POST", body }),

  removerContrato: (id: string) =>
    apiRequest<{ data: unknown }>(`/api/contratos/${encodeURIComponent(id)}`, { method: "DELETE" }),
  obterContrato: (id: string) =>
    apiRequest<DataEnvelope<import("./types").ContratoDetalhe>>(`/api/contratos/${encodeURIComponent(id)}`),

  obterParceiroDespesa: (id: string) =>
    apiRequest<DataEnvelope<import("./types").ParceiroDespesa>>(`/api/parceiro-despesas/${encodeURIComponent(id)}`),
  atualizarParceiroDespesa: (id: string, patch: Record<string, unknown>) =>
    apiRequest<{ data: import("./types").ParceiroDespesa }>(`/api/parceiro-despesas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    }),
  removerParceiroDespesa: (id: string) =>
    apiRequest<{ data: import("./types").ParceiroDespesa }>(`/api/parceiro-despesas/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

import type { Veiculo } from "./types";
