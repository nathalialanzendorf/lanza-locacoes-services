/** Cliente, veículo e parceiro: omitido ou true = ativo; só `false` = inativo. */
export function registroEstaAtivo(ativo?: boolean | null): boolean {
  return ativo !== false;
}

export const RotuloStatusRegistro = {
  Ativo: "Ativo",
  Inativo: "Inativo",
} as const;

export function rotuloStatusRegistro(ativo?: boolean | null): string {
  return registroEstaAtivo(ativo) ? RotuloStatusRegistro.Ativo : RotuloStatusRegistro.Inativo;
}

export const StatusRegistroFiltro = {
  Ativo: "ativo",
  Inativo: "inativo",
  Todos: "todos",
} as const;

export type StatusRegistroFiltroValor =
  (typeof StatusRegistroFiltro)[keyof typeof StatusRegistroFiltro];

export function filtroRegistroParaAtivo(
  filtro: StatusRegistroFiltroValor,
): boolean | undefined {
  if (filtro === StatusRegistroFiltro.Ativo) return true;
  if (filtro === StatusRegistroFiltro.Inativo) return false;
  return undefined;
}
