import { useQuery } from "@tanstack/react-query";
import { lanzaApi } from "./endpoints";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => lanzaApi.health(),
    retry: 1,
    staleTime: 30_000,
  });
}

export function useResumo() {
  return useQuery({
    queryKey: ["resumo"],
    queryFn: () => lanzaApi.resumo(),
    staleTime: 60_000,
  });
}

export function useClientes(ativo?: boolean) {
  return useQuery({
    queryKey: ["clientes", { ativo }],
    queryFn: () => lanzaApi.listarClientes(ativo),
  });
}

export function useVeiculos(params?: { ativo?: boolean; placa?: string }) {
  return useQuery({
    queryKey: ["veiculos", params],
    queryFn: () => lanzaApi.listarVeiculos(params),
  });
}

export function useContratos(params?: {
  status?: "ativo" | "encerrado";
  placa?: string;
  clienteId?: string;
  veiculoId?: string;
}) {
  return useQuery({
    queryKey: ["contratos", params],
    queryFn: () => lanzaApi.listarContratos(params),
  });
}

export function useDespesasCliente(params?: {
  emAberto?: boolean;
  ativo?: boolean;
  clienteId?: string;
  veiculoId?: string;
  placa?: string;
  categoria?: string;
}) {
  return useQuery({
    queryKey: ["despesas-cliente", params],
    queryFn: () => lanzaApi.listarDespesasCliente(params),
  });
}

export function useDespesasParceiro(params?: {
  emAberto?: boolean;
  placa?: string;
  categoria?: string;
  competencia?: string;
}) {
  return useQuery({
    queryKey: ["despesas-parceiro", params],
    queryFn: () => lanzaApi.listarDespesasParceiro(params),
  });
}

export function useLocacoes(params?: {
  abertas?: boolean;
  placa?: string;
  situacao?: string;
  clienteId?: string;
}) {
  return useQuery({
    queryKey: ["locacoes", params],
    queryFn: () => lanzaApi.listarLocacoes(params),
  });
}

export function useParceiros() {
  return useQuery({
    queryKey: ["parceiros"],
    queryFn: () => lanzaApi.listarParceiros(),
  });
}

export function useVinculosParceiro(params?: { veiculoId?: string; parceiroId?: string }) {
  return useQuery({
    queryKey: ["parceiros-vinculos", params],
    queryFn: () => lanzaApi.listarVinculosParceiro(params),
  });
}

export function useInfracoes(params?: {
  placa?: string;
  emAberto?: boolean;
  semCliente?: boolean;
  ativo?: boolean;
}) {
  return useQuery({
    queryKey: ["infracoes", params],
    queryFn: () => lanzaApi.listarInfracoes(params),
  });
}

export function useSyncMeta() {
  return useQuery({
    queryKey: ["sync-meta"],
    queryFn: () => lanzaApi.metaSync(),
    staleTime: 60_000,
  });
}

export function useSyncJobs(limit = 25) {
  return useQuery({
    queryKey: ["sync-jobs", limit],
    queryFn: () => lanzaApi.listarSyncJobs(limit),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      const active = jobs.some((j) => j.status === "pending" || j.status === "running");
      return active ? 3000 : false;
    },
  });
}
