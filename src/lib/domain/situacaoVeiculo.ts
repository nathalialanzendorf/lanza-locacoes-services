import { contratoOperacionalAtivo } from "./statusContrato.js";

export {
  CategoriaMovimentacao,
  CATEGORIAS_MOVIMENTACAO_VALIDAS,
  isCategoriaMovimentacaoValor,
  SituacaoLocacao,
  SITUACOES_LOCACAO_VALIDAS,
  isSituacaoLocacaoValor,
  situacaoLocacaoValida,
  type CategoriaMovimentacaoValor,
  type SituacaoLocacaoValor,
} from "./categoriaMovimentacao.js";

export const RotuloSituacaoVeiculo = {
  Locado: "Locado",
  NaoLocado: "Não locado",
  Inativo: "Inativo",
} as const;

export { contratoOperacionalAtivo };