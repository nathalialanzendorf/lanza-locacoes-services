import {
  montarRelatorioInfracoesBlocos,
  type RelatorioInfracoesBlocosDados,
} from "../../lib-imports.js";

export function relatorioInfracoes(): RelatorioInfracoesBlocosDados {
  return montarRelatorioInfracoesBlocos();
}
