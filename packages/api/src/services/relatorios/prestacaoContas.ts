import { montarPrestacaoContas, type PrestacaoContasInput } from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export function gerarPrestacaoContas(input: PrestacaoContasInput) {
  if (!input.competencia?.trim()) {
    throw new HttpError(400, 'Campo "competencia" é obrigatório (MM/AAAA)');
  }
  if (!Array.isArray(input.veiculos) || input.veiculos.length === 0) {
    throw new HttpError(400, 'Campo "veiculos" deve ser um array não vazio');
  }
  return montarPrestacaoContas(input);
}
