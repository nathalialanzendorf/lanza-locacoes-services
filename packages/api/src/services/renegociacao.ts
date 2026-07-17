import {
  executarRenegociacao,
  fetchGastoById,
  findClienteById,
  findVeiculoByPlaca,
  listarDebitosAbertos,
  somarDebitos,
  validarParcelas,
  type RenegociacaoInput,
  type ResumoDebito,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export type ResolverChavesInput = {
  motoristaKey?: string;
  rastreavelKey?: string;
  clienteId?: string;
  placa?: string;
};

export function resolverChavesRenegociacao(input: ResolverChavesInput): {
  motoristaKey: string;
  rastreavelKey: string;
  clienteId?: string;
  placa?: string;
} {
  const mkDirect = input.motoristaKey?.trim();
  const rkDirect = input.rastreavelKey?.trim();
  if (mkDirect && rkDirect) {
    return { motoristaKey: mkDirect, rastreavelKey: rkDirect };
  }

  const clienteId = input.clienteId?.trim();
  const placa = input.placa?.trim();
  if (!clienteId || !placa) {
    throw new HttpError(
      400,
      'Informe "motoristaKey" + "rastreavelKey" ou "clienteId" + "placa"',
    );
  }

  const cliente = findClienteById(clienteId);
  if (!cliente) throw new HttpError(404, "Cliente não encontrado");
  const motoristaKey =
    cliente.rastreameMotoristaKey != null && String(cliente.rastreameMotoristaKey).trim()
      ? String(cliente.rastreameMotoristaKey).trim()
      : "";
  if (!motoristaKey) {
    throw new HttpError(400, "Cliente sem rastreameMotoristaKey — rode sync-cliente");
  }

  const veiculo = findVeiculoByPlaca(placa);
  if (!veiculo) throw new HttpError(404, "Veículo não encontrado");
  const rastreavelKey =
    veiculo.rastreameRastreavelKey != null && String(veiculo.rastreameRastreavelKey).trim()
      ? String(veiculo.rastreameRastreavelKey).trim()
      : "";
  if (!rastreavelKey) {
    throw new HttpError(400, "Veículo sem rastreameRastreavelKey — rode sync-veículo");
  }

  return { motoristaKey, rastreavelKey, clienteId, placa };
}

function filtrarVencidos(debitos: ResumoDebito[]): ResumoDebito[] {
  const now = Date.now();
  return debitos.filter((d) => {
    const info = String(d.info ?? "").toUpperCase();
    if (info.includes("ATRASADO")) return true;
    if (d.data) {
      const t = new Date(d.data).getTime();
      if (Number.isFinite(t) && t < now) return true;
    }
    return false;
  });
}

export async function resumoRenegociacao(
  input: ResolverChavesInput & { apenasVencidos?: boolean },
) {
  const chaves = resolverChavesRenegociacao(input);
  let debitos = await listarDebitosAbertos(chaves.motoristaKey, chaves.rastreavelKey);
  if (input.apenasVencidos) {
    debitos = filtrarVencidos(debitos);
  }
  return {
    ...chaves,
    total: debitos.length,
    soma: somarDebitos(debitos),
    debitos,
    gastosIds: debitos.map((d) => d.id),
    apenasVencidos: input.apenasVencidos === true,
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
