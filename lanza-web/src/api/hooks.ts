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
}) {
  return useQuery({
    queryKey: ["contratos", params],
    queryFn: () => lanzaApi.listarContratos(params),
  });
}

export function useDespesasCliente(params?: { emAberto?: boolean }) {
  return useQuery({
    queryKey: ["despesas-cliente", params],
    queryFn: () => lanzaApi.listarDespesasCliente(params),
  });
}

export function useLocacoes(abertas?: boolean) {
  return useQuery({
    queryKey: ["locacoes", { abertas }],
    queryFn: () => lanzaApi.listarLocacoes(
      abertas === undefined ? undefined : { abertas },
    ),
  });
}
