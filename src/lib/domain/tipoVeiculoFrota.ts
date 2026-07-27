/** Classificação operacional do veículo no cadastro. */
export const TipoVeiculoFrota = {
  Locacao: "locacao",
  Particular: "particular",
  Venda: "venda",
} as const;

export type TipoVeiculoFrotaValor = (typeof TipoVeiculoFrota)[keyof typeof TipoVeiculoFrota];

const TIPOS_VEICULO_FROTA_VALIDOS = new Set<string>(Object.values(TipoVeiculoFrota));

export function isTipoVeiculoFrotaValor(raw: string | null | undefined): raw is TipoVeiculoFrotaValor {
  return TIPOS_VEICULO_FROTA_VALIDOS.has(String(raw ?? "").trim().toLowerCase());
}

export const RotuloTipoVeiculoFrota = {
  Locacao: "Locação",
  Particular: "Particular",
  Venda: "Venda",
} as const;

export function rotuloTipoVeiculoFrota(valor: TipoVeiculoFrotaValor): string {
  switch (valor) {
    case TipoVeiculoFrota.Locacao:
      return RotuloTipoVeiculoFrota.Locacao;
    case TipoVeiculoFrota.Particular:
      return RotuloTipoVeiculoFrota.Particular;
    case TipoVeiculoFrota.Venda:
      return RotuloTipoVeiculoFrota.Venda;
  }
}

export function parseTipoVeiculoFrota(raw: string | null | undefined): TipoVeiculoFrotaValor {
  const v = String(raw ?? "").trim().toLowerCase();
  if (isTipoVeiculoFrotaValor(v)) return v;
  return TipoVeiculoFrota.Locacao;
}

type VeiculoTipoInput = { tipoFrota?: string | null; particular?: boolean | null };

/** Resolve tipo a partir de `tipoFrota` ou legado `particular`. */
export function tipoFrotaDeVeiculo(v: VeiculoTipoInput): TipoVeiculoFrotaValor {
  if (v.tipoFrota != null && isTipoVeiculoFrotaValor(v.tipoFrota)) {
    return parseTipoVeiculoFrota(v.tipoFrota);
  }
  if (v.particular === true) return TipoVeiculoFrota.Particular;
  return TipoVeiculoFrota.Locacao;
}

export function isVeiculoFrotaLocacao(v: VeiculoTipoInput): boolean {
  return tipoFrotaDeVeiculo(v) === TipoVeiculoFrota.Locacao;
}

export function particularLegadoDeTipoFrota(tipo: TipoVeiculoFrotaValor): boolean {
  return tipo === TipoVeiculoFrota.Particular;
}
