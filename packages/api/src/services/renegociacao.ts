import {
  executarRenegociacao,
  fetchGastoById,
  fetchRastreameToken,
  findClienteInDb,
  findVeiculoInDb,
  loadClientesDbAsync,
  loadVeiculosDbAsync,
  listarDebitosAbertos,
  somarDebitos,
  validarParcelas,
  type RenegociacaoInput,
  type ResumoDebito,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { listarDespesasAsync, type DespesaClienteListagem } from "./despesas.js";

export type ResolverChavesInput = {
  motoristaKey?: string;
  rastreavelKey?: string;
  clienteId?: string;
  placa?: string;
};

export async function resolverChavesRenegociacao(input: ResolverChavesInput): Promise<{
  motoristaKey: string;
  rastreavelKey: string;
  clienteId?: string;
  placa?: string;
}> {
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

  const [clientesDb, veiculosDb] = await Promise.all([
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
  ]);
  const cliente = findClienteInDb(clientesDb, clienteId);
  if (!cliente) throw new HttpError(404, "Cliente não encontrado");
  const motoristaKey =
    cliente.rastreameMotoristaKey != null && String(cliente.rastreameMotoristaKey).trim()
      ? String(cliente.rastreameMotoristaKey).trim()
      : "";
  if (!motoristaKey) {
    throw new HttpError(400, "Cliente sem rastreameMotoristaKey — rode sync-cliente");
  }

  const veiculo = findVeiculoInDb(veiculosDb, placa);
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

function parseDataDespesaIso(raw?: string | null): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (s.includes("T")) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  return undefined;
}

function localDespesaToResumoDebito(d: DespesaClienteListagem): ResumoDebito {
  const id = d.rastreameId ?? d.autoInfracao ?? d.id;
  return {
    id,
    info: String(d.descricao ?? d.titulo ?? d.autoInfracao ?? d.id).trim(),
    total: Number(d.valorMulta) || 0,
    data: parseDataDespesaIso(d.rastreameDataIso ?? d.dataAutuacao),
    tipo: d.categoria,
  };
}

async function listarDebitosLocais(
  clienteId: string,
  placa: string,
  apenasVencidos: boolean,
): Promise<ResumoDebito[]> {
  const r = await listarDespesasAsync({
    clienteId,
    placa,
    emAberto: true,
    ativo: true,
  });
  let debitos = r.items.map(localDespesaToResumoDebito).filter((d) => d.total > 0);
  if (apenasVencidos) debitos = filtrarVencidos(debitos);
  return debitos;
}

async function resolverChavesOpcional(input: ResolverChavesInput): Promise<{
  motoristaKey: string;
  rastreavelKey: string;
  clienteId?: string;
  placa?: string;
}> {
  try {
    return await resolverChavesRenegociacao(input);
  } catch {
    return {
      motoristaKey: input.motoristaKey?.trim() ?? "",
      rastreavelKey: input.rastreavelKey?.trim() ?? "",
      clienteId: input.clienteId?.trim(),
      placa: input.placa?.trim(),
    };
  }
}

function exigeRastreameConfigurado(): never {
  throw new HttpError(
    503,
    "Integração Rastreame não configurada. Defina RASTREAME_AUTH ou RASTREAME_LOGIN+RASTREAME_SENHA nas variáveis de ambiente da API (Vercel).",
  );
}

async function garantirRastreameConfigurado(): Promise<void> {
  if (!(await fetchRastreameToken())) exigeRastreameConfigurado();
}

export async function resumoRenegociacao(
  input: ResolverChavesInput & { apenasVencidos?: boolean },
) {
  const token = await fetchRastreameToken();
  const apenasVencidos = input.apenasVencidos === true;

  if (token) {
    try {
      const chaves = await resolverChavesRenegociacao(input);
      let debitos = await listarDebitosAbertos(chaves.motoristaKey, chaves.rastreavelKey);
      if (apenasVencidos) debitos = filtrarVencidos(debitos);
      return {
        ...chaves,
        fonte: "rastreame" as const,
        rastreameConfigurado: true,
        total: debitos.length,
        soma: somarDebitos(debitos),
        debitos,
        gastosIds: debitos.map((d) => d.id),
        apenasVencidos,
      };
    } catch (err) {
      if (!(input.clienteId?.trim() && input.placa?.trim())) throw err;
    }
  }

  const clienteId = input.clienteId?.trim();
  const placa = input.placa?.trim();
  if (!clienteId || !placa) {
    if (!token) exigeRastreameConfigurado();
    throw new HttpError(
      400,
      'Informe "motoristaKey" + "rastreavelKey" ou "clienteId" + "placa"',
    );
  }

  const chaves = await resolverChavesOpcional(input);
  const debitos = await listarDebitosLocais(clienteId, placa, apenasVencidos);

  return {
    ...chaves,
    clienteId,
    placa,
    fonte: "local" as const,
    rastreameConfigurado: Boolean(token),
    aviso: token
      ? undefined
      : "Débitos carregados do cadastro local. Configure RASTREAME_AUTH na Vercel para executar renegociação no Rastreame.",
    total: debitos.length,
    soma: somarDebitos(debitos),
    debitos,
    gastosIds: debitos.map((d) => d.id),
    apenasVencidos,
  };
}

export async function previewRenegociacao(input: RenegociacaoInput) {
  await garantirRastreameConfigurado();
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
  await garantirRastreameConfigurado();
  const preview = await previewRenegociacao(input);
  const resultado = await executarRenegociacao(input, { execute });
  return { preview, resultado, executado: execute };
}
