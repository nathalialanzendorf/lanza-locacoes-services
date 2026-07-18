import type { Contrato, Veiculo } from "@/api/types";

/** Status operacional derivado de `ativo` + contrato ativo na placa. */
export type StatusVeiculoOperacional = "locado" | "nao_locado" | "inativo";

function compactPlaca(placa: string): string {
  return String(placa ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Placas com contrato operacional ativo (status ativo, sem data de encerramento). */
export function placasComContratoAtivo(
  contratos: Array<Pick<Contrato, "placa" | "status" | "dataEncerramento">>,
): Set<string> {
  const set = new Set<string>();
  for (const c of contratos) {
    if (c.status !== "ativo") continue;
    if (String(c.dataEncerramento ?? "").trim()) continue;
    const placa = compactPlaca(c.placa ?? "");
    if (placa) set.add(placa);
  }
  return set;
}

export function statusVeiculoOperacional(
  v: Pick<Veiculo, "ativo" | "placa">,
  placasContratoAtivo: ReadonlySet<string> = new Set(),
): StatusVeiculoOperacional {
  if (v.ativo === false) return "inativo";
  if (placasContratoAtivo.has(compactPlaca(v.placa ?? ""))) return "locado";
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
  v: Pick<Veiculo, "ativo" | "placa">,
  filtro: FiltroStatusVeiculo,
  placasContratoAtivo: ReadonlySet<string> = new Set(),
): boolean {
  const status = statusVeiculoOperacional(v, placasContratoAtivo);
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
