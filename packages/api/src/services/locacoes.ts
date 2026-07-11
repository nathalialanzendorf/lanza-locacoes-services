import {
  excluirLocacao,
  gravarLocacao,
  loadLocacoesDb,
  type LocacaoInput,
  type LocacaoRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export function listarLocacoes(opts: {
  placa?: string;
  clienteId?: string;
  situacao?: string;
} = {}): { total: number; items: LocacaoRegistro[] } {
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
