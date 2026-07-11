import {
  executarRenegociacao,
  fetchGastoById,
  listarDebitosAbertos,
  somarDebitos,
  validarParcelas,
  type RenegociacaoInput,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export async function resumoRenegociacao(motoristaKey: string, rastreavelKey: string) {
  const debitos = await listarDebitosAbertos(motoristaKey, rastreavelKey);
  return {
    motoristaKey,
    rastreavelKey,
    total: debitos.length,
    soma: somarDebitos(debitos),
    debitos,
    gastosIds: debitos.map((d) => d.id),
  };
}

export async function previewRenegociacao(input: RenegociacaoInput) {
  if (!input.negociacaoCodigo || !input.gastosIds?.length || !input.parcelas?.length) {
    throw new HttpError(400, "Requer negociacaoCodigo, gastosIds[] e parcelas[]");
  }
  if (!input.motoristaKey || !input.rastreavelKey) {
    throw new HttpError(400, "Requer motoristaKey e rastreavelKey");
  }

  const debitos: Array<{ id: string | number; total: number; info: string }> = [];
  let totalDebitos = 0;
  for (const id of input.gastosIds) {
    const g = await fetchGastoById(id);
    const total = Number(g.total ?? 0);
    totalDebitos += total;
    debitos.push({ id, total, info: String(g.info ?? "") });
  }
  totalDebitos = Math.round(totalDebitos * 100) / 100;
  const val = validarParcelas(totalDebitos, input.parcelas);

  return {
    debitos,
    totalDebitos,
    parcelas: input.parcelas,
    validacao: val,
  };
}

export async function executarRenegociacaoApi(input: RenegociacaoInput, execute = false) {
  const preview = await previewRenegociacao(input);
  const resultado = await executarRenegociacao(input, { execute });
  return { preview, resultado, executado: execute };
}
