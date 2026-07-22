import {
  excluirLocacaoAsync,
  gravarLocacaoAsync,
  listarLocacoesAsync,
  loadLocacoesDbAsync,
  sugerirLocacoes,
  type LocacaoInput,
  type LocacaoRegistro,
  type SugerirOpts,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export async function listarLocacoes(opts: {
  placa?: string;
  veiculoId?: string;
  clienteId?: string;
  situacao?: string;
  abertas?: boolean;
  dataInicial?: string;
  dataFinal?: string;
} = {}): Promise<{ total: number; items: LocacaoRegistro[] }> {
  const items = await listarLocacoesAsync({
    placa: opts.placa,
    veiculoId: opts.veiculoId,
    clienteId: opts.clienteId,
    situacao: opts.situacao as LocacaoInput["situacao"] | undefined,
    abertas: opts.abertas,
    dataInicial: opts.dataInicial,
    dataFinal: opts.dataFinal,
  });
  return { total: items.length, items };
}

export async function obterLocacao(id: string): Promise<LocacaoRegistro | null> {
  const db = await loadLocacoesDbAsync();
  return db.locacoes.find((l) => l.id === id) ?? null;
}

export async function criarOuAtualizarLocacao(input: LocacaoInput): Promise<{
  data: LocacaoRegistro;
  acao: string;
  aviso: string | null;
}> {
  try {
    const r = await gravarLocacaoAsync(input);
    return { data: r.registro, acao: r.acao, aviso: r.aviso };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao gravar locação";
    throw new HttpError(400, msg);
  }
}

export async function removerLocacao(id: string): Promise<LocacaoRegistro> {
  const item = await excluirLocacaoAsync(id);
  if (!item) {
    throw new HttpError(404, "Locação não encontrada");
  }
  return item;
}

export async function atualizarLocacao(id: string, patch: Partial<LocacaoInput>) {
  const atual = await obterLocacao(id);
  if (!atual) throw new HttpError(404, "Locação não encontrada");
  const input: LocacaoInput = {
    id,
    placa: patch.placa ?? atual.placa,
    situacao: patch.situacao ?? atual.situacao,
    inicio: patch.inicio ?? atual.inicio,
    fim: patch.fim !== undefined ? patch.fim : atual.fim,
    condutor: patch.clienteId !== undefined ? patch.clienteId : patch.condutor !== undefined ? patch.condutor : atual.clienteId ?? atual.condutorNome,
    contratoId: patch.contratoId !== undefined ? patch.contratoId : atual.contratoId,
    tipoLocacao: patch.tipoLocacao !== undefined ? patch.tipoLocacao : atual.tipoLocacao,
    valorCobrado: patch.valorCobrado !== undefined ? patch.valorCobrado : atual.valorCobrado,
    valorPago: patch.valorPago !== undefined ? patch.valorPago : atual.valorPago,
    substituiPlaca: patch.substituiPlaca !== undefined ? patch.substituiPlaca : atual.substituiPlaca,
    observacao: patch.observacao !== undefined ? patch.observacao : atual.observacao,
  };
  return criarOuAtualizarLocacao(input);
}

export function sugerirLocacoesPeriodo(opts: SugerirOpts) {
  if (!opts.competencia?.trim()) {
    throw new HttpError(400, 'Campo "competencia" (MM/AAAA) é obrigatório');
  }
  return sugerirLocacoes(opts);
}
