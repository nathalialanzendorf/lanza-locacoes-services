import crypto from "node:crypto";

import {
  compactPlaca,
  dataPagamentoParaIso,
  editarClienteDespesa,
  extrairCodigoNegociado,
  findClienteInDb,
  findVeiculoInDb,
  gravarClienteDespesa,
  infoMarcadaNegociada,
  infoParcelaRenegociacao,
  isClienteDespesaAtiva,
  loadClienteDespesasDbAsync,
  loadClientesDbAsync,
  loadVeiculosDbAsync,
  proximoCodigoNegociado,
  somarDebitos,
  validarParcelas,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
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

const PERSIST_OPTS = { syncRastreame: false as const, skipInferir: true as const };

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
  if (!clienteId) {
    throw new HttpError(
      400,
      'Informe "motoristaKey" + "rastreavelKey" ou "clienteId" (placa opcional)',
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

  if (!placa) {
    return { motoristaKey, rastreavelKey: "", clienteId };
  }

  const veiculo = findVeiculoInDb(veiculosDb, placa);
  if (!veiculo) throw new HttpError(404, "Veículo não encontrado");
  const rastreavelKey =
    veiculo.rastreameRastreavelKey != null && String(veiculo.rastreameRastreavelKey).trim()
      ? String(veiculo.rastreameRastreavelKey).trim()
      : "";

  return { motoristaKey, rastreavelKey, clienteId, placa };
}

async function coletarCodigosNegociacaoCliente(clienteId?: string): Promise<number[]> {
  const id = clienteId?.trim();
  if (!id) return [];
  const codigos: number[] = [];
  const r = await listarDespesasAsync({ clienteId: id, ativo: true });
  for (const d of r.items) {
    const c = extrairCodigoNegociado(String(d.descricao ?? d.titulo ?? ""));
    if (c != null) codigos.push(c);
  }
  return codigos;
}

export async function calcularProximoNegociacaoCodigo(input: {
  clienteId?: string;
}): Promise<string> {
  const codigos = await coletarCodigosNegociacaoCliente(input.clienteId);
  return proximoCodigoNegociado(codigos);
}

async function resolverNegociacaoCodigo(
  input: RenegociacaoInput,
): Promise<RenegociacaoInput & { negociacaoCodigo: string }> {
  const manual = input.negociacaoCodigo?.trim();
  if (manual) return { ...input, negociacaoCodigo: manual };
  const codigo = await calcularProximoNegociacaoCodigo({ clienteId: input.clienteId });
  return { ...input, negociacaoCodigo: codigo };
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

function isoToDataAutuacaoBr(data: string): string {
  const t = data.trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return t;
}

function localDespesaToResumoDebito(d: DespesaClienteListagem): ResumoDebito {
  const id = d.id;
  return {
    id,
    info: String(d.descricao ?? d.titulo ?? d.autoInfracao ?? d.id).trim(),
    total: Number(d.valorMulta) || 0,
    data: parseDataDespesaIso(d.rastreameDataIso ?? d.dataAutuacao),
    tipo: d.categoria,
  };
}

function debitoJaRenegociado(info: string): boolean {
  return /\[NEGOCIADO/i.test(info);
}

async function listarDebitosLocais(
  clienteId: string,
  placa?: string,
  apenasVencidos = false,
): Promise<ResumoDebito[]> {
  const r = await listarDespesasAsync({
    clienteId,
    placa: placa?.trim() || undefined,
    emAberto: true,
    ativo: true,
  });
  let debitos = r.items
    .map(localDespesaToResumoDebito)
    .filter((d) => d.total > 0)
    .filter((d) => !debitoJaRenegociado(d.info));
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

async function resolverDespesaPorGastoId(
  gastoId: string | number,
): Promise<ClienteDespesaRegistro | null> {
  const key = String(gastoId).trim();
  const db = await loadClienteDespesasDbAsync();
  return (
    db.clienteDespesas.find(
      (m) =>
        m.id === key ||
        String(m.autoInfracao).trim().toUpperCase() === key.toUpperCase() ||
        (m.rastreameId != null && String(m.rastreameId) === key),
    ) ?? null
  );
}

export async function resumoRenegociacao(
  input: ResolverChavesInput & { apenasVencidos?: boolean },
) {
  const clienteId = input.clienteId?.trim();
  if (!clienteId) {
    throw new HttpError(400, 'Informe "clienteId" (placa opcional)');
  }

  const placa = input.placa?.trim();
  const apenasVencidos = input.apenasVencidos === true;
  const chaves = await resolverChavesOpcional(input);
  const debitos = await listarDebitosLocais(clienteId, placa, apenasVencidos);
  const negociacaoCodigo = await calcularProximoNegociacaoCodigo({ clienteId });

  return {
    ...chaves,
    clienteId,
    placa,
    negociacaoCodigo,
    fonte: "local" as const,
    total: debitos.length,
    soma: somarDebitos(debitos),
    debitos,
    gastosIds: debitos.map((d) => d.id),
    apenasVencidos,
  };
}

export async function previewRenegociacao(input: RenegociacaoInput) {
  const resolved = await resolverNegociacaoCodigo(input);
  if (!resolved.gastosIds?.length || !resolved.parcelas?.length) {
    throw new HttpError(400, "Requer gastosIds[] e parcelas[]");
  }

  const debitos: Array<{ id: string | number; total: number; info: string }> = [];
  let totalDebitos = 0;
  for (const id of resolved.gastosIds) {
    const d = await resolverDespesaPorGastoId(id);
    if (!d) throw new HttpError(404, `Despesa não encontrada: ${id}`);
    const info = String(d.descricao ?? d.titulo ?? "");
    if (debitoJaRenegociado(info)) {
      throw new HttpError(400, `Despesa ${id} já renegociada`);
    }
    const total = Number(d.valorMulta) || 0;
    totalDebitos += total;
    debitos.push({ id: d.id, total, info });
  }
  totalDebitos = Math.round(totalDebitos * 100) / 100;
  const val = validarParcelas(totalDebitos, resolved.parcelas);

  return {
    negociacaoCodigo: resolved.negociacaoCodigo,
    debitos,
    totalDebitos,
    parcelas: resolved.parcelas,
    validacao: val,
  };
}

export async function salvarRenegociacaoApi(input: RenegociacaoInput) {
  const preview = await previewRenegociacao(input);
  if (!preview.validacao.ok) {
    throw new HttpError(400, "Soma das parcelas não confere com o total dos débitos selecionados");
  }

  const resolved = await resolverNegociacaoCodigo(input);
  const codigo = resolved.negociacaoCodigo!;
  const marcados: Array<{ id: string; infoAntes: string; infoDepois: string }> = [];
  const parcelasCriadas: Array<{ id: string; info: string; valor: number; data: string }> = [];
  const avisos: string[] = [];

  let veiculoPlaca = resolved.placa?.trim();
  let condutorId = resolved.clienteId?.trim();

  for (const id of resolved.gastosIds) {
    const d = await resolverDespesaPorGastoId(id);
    if (!d) throw new HttpError(404, `Despesa não encontrada: ${id}`);
    const infoAntes = String(d.descricao ?? "");
    const descricaoDepois = infoMarcadaNegociada(infoAntes, codigo);
    const patch: ClienteDespesaPatch = { descricao: descricaoDepois };
    if (d.titulo?.trim()) {
      patch.titulo = infoMarcadaNegociada(String(d.titulo), codigo);
    }
    const r = await editarClienteDespesa(d.id, patch, PERSIST_OPTS);
    if (!r) throw new HttpError(500, `Falha ao atualizar despesa ${id}`);
    marcados.push({ id: d.id, infoAntes, infoDepois: descricaoDepois });
    if (!veiculoPlaca && d.veiculoId?.trim()) veiculoPlaca = d.veiculoId.trim();
    if (!condutorId && d.condutorId?.trim()) condutorId = d.condutorId.trim();
  }

  if (!condutorId) {
    throw new HttpError(400, "Informe o cliente ou selecione débitos com condutor vinculado");
  }
  if (!veiculoPlaca) {
    throw new HttpError(400, "Informe um veículo ou selecione débitos com placa vinculada");
  }

  const chaves = await resolverChavesOpcional({ clienteId: condutorId, placa: veiculoPlaca });
  const db = await loadClienteDespesasDbAsync();

  for (const p of resolved.parcelas) {
    const descricao = infoParcelaRenegociacao(p.numero, p.totalParcelas);
    const dup = db.clienteDespesas.some(
      (m) =>
        isClienteDespesaAtiva(m) &&
        String(m.condutorId ?? "").trim() === condutorId &&
        compactPlaca(m.veiculoId) === compactPlaca(veiculoPlaca!) &&
        String(m.descricao ?? "").trim() === descricao,
    );
    if (dup) {
      avisos.push(`Parcela ${descricao} já existe — ignorada.`);
      continue;
    }

    const dataIso = dataPagamentoParaIso(p.data);
    const gravado = await gravarClienteDespesa(
      veiculoPlaca,
      {
        autoInfracao: `LOCAL-RENEG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        descricao,
        localInfracao: "",
        dataAutuacao: isoToDataAutuacaoBr(p.data),
        valorMulta: p.valor,
        situacao: "Em aberto",
        limiteDefesa: "",
        categoria: "Renegociação",
        origem: "manual",
        paga: false,
        condutorId,
        rastreameMotoristaKey: chaves.motoristaKey || null,
        rastreameRastreavelKey: chaves.rastreavelKey || null,
        rastreameDataIso: dataIso,
        rastreameTipo: "DOCUMENTACAO",
      },
      PERSIST_OPTS,
    );

    parcelasCriadas.push({
      id: gravado.registro.id,
      info: descricao,
      valor: p.valor,
      data: dataIso,
    });
  }

  return {
    preview,
    resultado: { marcados, parcelasCriadas, avisos },
    salvo: true,
  };
}

/** @deprecated use salvarRenegociacaoApi */
export async function executarRenegociacaoApi(input: RenegociacaoInput) {
  return salvarRenegociacaoApi(input);
}
