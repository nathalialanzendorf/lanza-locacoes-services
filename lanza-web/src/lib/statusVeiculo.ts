import type { Veiculo } from "@/api/types";

/** Status operacional derivado de `ativo` + vínculo de contrato. */
export type StatusVeiculoOperacional = "locado" | "nao_locado" | "inativo";

export function statusVeiculoOperacional(
  v: Pick<Veiculo, "ativo" | "clienteVinculadoId">,
): StatusVeiculoOperacional {
  if (v.ativo === false) return "inativo";
  if (String(v.clienteVinculadoId ?? "").trim()) return "locado";
  return "nao_locado";
}

export function statusVeiculoLabel(status: StatusVeiculoOperacional): string {
  switch (status) {
    case "locado":
      return "Locado";
    case "nao_locado":
      return "Não locado";
    case "inativo":
      return "Inativo";
  }
}

export function statusVeiculoClass(status: StatusVeiculoOperacional): string {
  switch (status) {
    case "locado":
      return "badge badge--ok";
    case "nao_locado":
      return "badge";
    case "inativo":
      return "badge badge--amber";
  }
}

export type FiltroStatusVeiculo = "operacionais" | "locado" | "nao_locado" | "inativo" | "todos";

export function veiculoPassaFiltroStatus(
  v: Pick<Veiculo, "ativo" | "clienteVinculadoId">,
  filtro: FiltroStatusVeiculo,
): boolean {
  const status = statusVeiculoOperacional(v);
  switch (filtro) {
    case "operacionais":
      return status !== "inativo";
    case "locado":
      return status === "locado";
    case "nao_locado":
      return status === "nao_locado";
    case "inativo":
      return status === "inativo";
    case "todos":
      return true;
  }
}
