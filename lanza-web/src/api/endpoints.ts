import { apiRequest } from "./client";
import type {
  Cliente,
  ClienteDespesa,
  Contrato,
  DataEnvelope,
  Health,
  ListEnvelope,
  Locacao,
  Resumo,
  Veiculo,
} from "./types";

export const lanzaApi = {
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

  listarContratos: (params?: {
    status?: "ativo" | "encerrado";
    clienteId?: string;
    veiculoId?: string;
    placa?: string;
  }) => apiRequest<ListEnvelope<Contrato>>("/api/contratos", { params }),

  listarDespesasCliente: (params?: { emAberto?: boolean; clienteId?: string }) =>
    apiRequest<ListEnvelope<ClienteDespesa>>("/api/despesas", { params }),

  listarLocacoes: (params?: { abertas?: boolean }) =>
    apiRequest<ListEnvelope<Locacao>>("/api/locacoes", { params }),
};
