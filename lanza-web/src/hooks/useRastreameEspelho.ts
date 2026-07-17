import { useMutation, useQueryClient } from "@tanstack/react-query";

import { lanzaApi } from "@/api/endpoints";
import { useHealth } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";

export function useRastreameEspelho() {
  const health = useHealth();
  const qc = useQueryClient();

  const config = health.data?.rastreameEspelho;
  const ativo = config?.ativo ?? false;

  const mutation = useMutation({
    mutationFn: (novoAtivo: boolean) => lanzaApi.atualizarRastreameEspelho(novoAtivo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["health"] });
    },
  });

  async function setAtivo(novoAtivo: boolean) {
    try {
      await mutation.mutateAsync(novoAtivo);
    } catch (err) {
      throw err instanceof LanzaApiError ? err : new Error("Falha ao atualizar configuração");
    }
  }

  return {
    ativo,
    config,
    loading: health.isLoading || mutation.isPending,
    setAtivo,
    error: mutation.error,
  };
}
