/** Tipo de locação quando categoria = locado (`locacoes.tipoLocacao`). */
export const TipoLocacao = {
  Diaria: "diaria",
  Semanal: "semanal",
  Mensal: "mensal",
} as const;

export type TipoLocacaoValor = (typeof TipoLocacao)[keyof typeof TipoLocacao];

export const TIPOS_LOCACAO_VALIDOS = new Set<string>(Object.values(TipoLocacao));

export function isTipoLocacaoValor(raw: string | null | undefined): raw is TipoLocacaoValor {
  return TIPOS_LOCACAO_VALIDOS.has(String(raw ?? "").trim());
}

/** Mesmos valores em `contratos.tipoContrato`. */
export const TipoContrato = TipoLocacao;

export type TipoContratoValor = TipoLocacaoValor;

export const isTipoContratoValor = isTipoLocacaoValor;

export function parseTipoContrato(raw: string | null | undefined): TipoContratoValor {
  const v = String(raw ?? "").trim().toLowerCase();
  if (isTipoContratoValor(v)) return v;
  return TipoContrato.Semanal;
}
