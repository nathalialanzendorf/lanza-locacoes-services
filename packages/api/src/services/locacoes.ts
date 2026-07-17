import {
  excluirLocacao,
  gravarLocacao,
  listarLocacoes as listarLocacoesLib,
  loadLocacoesDb,
  sugerirLocacoes,
  type LocacaoInput,
  type LocacaoRegistro,
  type SugerirOpts,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export function listarLocacoes(opts: {
  placa?: string;
  clienteId?: string;
  situacao?: string;
  abertas?: boolean;
} = {}): { total: number; items: LocacaoRegistro[] } {
  if (opts.abertas || (opts.situacao && !opts.clienteId)) {
    let items = listarLocacoesLib({
      placa: opts.placa,
      situacao: opts.situacao as LocacaoInput["situacao"] | undefined,
      abertas: opts.abertas,
    });
    if (opts.clienteId?.trim()) {
      items = items.filter((l) => l.clienteId === opts.clienteId?.trim());
    }
    return { total: items.length, items };
  }

  let items = loadLocacoesDb().locacoes;

  if (opts.placa?.trim()) {
    const p = opts.placa.trim().toUpperCase();
    items = items.filter((l) => l.placa.toUpperCase().includes(p.replace(/[^A-Z0-9]/g, "")));
  }
  if (opts.clienteId?.trim()) {
    items = items.filter((l) => l.clienteId === opts.clienteId?.trim());
  }
  if (opts.situacao?.trim()) {
    items = items.filter((l) => l.situacao === opts.situacao?.trim());
  }

  return { total: items.length, items };
}

export function obterLocacao(id: string): LocacaoRegistro | null {
  return loadLocacoesDb().locacoes.find((l) => l.id === id) ?? null;
}

export function criarOuAtualizarLocacao(input: LocacaoInput): {
  data: LocacaoRegistro;
  acao: string;
  aviso: string | null;
} {
  try {
    const r = gravarLocacao(input);
    return { data: r.registro, acao: r.acao, aviso: r.aviso };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao gravar locação";
    throw new HttpError(400, msg);
  }
}

export function removerLocacao(id: string): LocacaoRegistro {
  const item = excluirLocacao(id);
  if (!item) {
    throw new HttpError(404, "Locação não encontrada");
  }
  return item;
}

export function atualizarLocacao(id: string, patch: Partial<LocacaoInput>) {
  const atual = obterLocacao(id);
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
