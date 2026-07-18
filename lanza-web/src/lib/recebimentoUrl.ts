import type { DashboardRecebimentoLinha } from "@/api/types";

function compactPlaca(placa: string): string {
  return placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Link para baixa manual com cliente, placa, valor e data pré-preenchidos. */
export function urlLancarRecebimento(
  linha: DashboardRecebimentoLinha,
  dataReferenciaBr?: string | null,
): string | null {
  const clienteId = linha.clienteId?.trim();
  if (!clienteId) return null;

  const params = new URLSearchParams();
  params.set("clienteId", clienteId);

  const placa = linha.placa?.trim();
  if (placa) params.set("placa", compactPlaca(placa));

  if (Number.isFinite(linha.valor) && linha.valor > 0) {
    params.set("valor", String(linha.valor));
  }

  const despesaId = linha.despesaId?.trim();
  if (despesaId) params.set("despesaId", despesaId);

  const data = dataReferenciaBr?.trim();
  if (data && data !== "—") params.set("dataBr", data);

  return `/recebimentos?${params.toString()}`;
}
