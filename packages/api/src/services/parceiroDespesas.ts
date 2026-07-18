import {
  findVeiculoById,
  findVeiculoByPlaca,
  gravarParceiroDespesaManual,
  isVeiculoAtivo,
  lancarRastreadorFixo,
  loadParceiroDespesasDb,
  marcarBaixaParceiroDespesa,
  saveParceiroDespesasDb,
  type ParceiroDespesaInput,
  type ParceiroDespesaRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { listarVinculos } from "./parceiros.js";

export type ListarParceiroDespesasOpts = {
  placa?: string;
  veiculoId?: string;
  parceiroId?: string;
  categoria?: string;
  competencia?: string;
  emAberto?: boolean;
  /** Filtra pelo status ativo/inativo do veículo vinculado à despesa. */
  veiculoAtivo?: boolean;
};

function emAberto(d: ParceiroDespesaRegistro): boolean {
  return !String(d.baixa ?? "").trim();
}

function veiculoDaDespesa(d: ParceiroDespesaRegistro) {
  if (d.veiculoId) return findVeiculoById(d.veiculoId);
  if (d.placa) return findVeiculoByPlaca(d.placa);
  return null;
}

function veiculoIdsDoParceiro(parceiroId: string): Set<string> {
  return new Set(listarVinculos({ parceiroId }).items.map((v) => v.veiculoId));
}

function despesaDoParceiro(d: ParceiroDespesaRegistro, veiculoIds: Set<string>): boolean {
  if (d.veiculoId && veiculoIds.has(d.veiculoId)) return true;
  const veiculo = veiculoDaDespesa(d);
  return veiculo ? veiculoIds.has(veiculo.id) : false;
}

export function listarParceiroDespesas(opts: ListarParceiroDespesasOpts = {}) {
  let items = loadParceiroDespesasDb().parceiroDespesas;

  if (opts.parceiroId?.trim()) {
    const veiculoIds = veiculoIdsDoParceiro(opts.parceiroId.trim());
    items = items.filter((d) => despesaDoParceiro(d, veiculoIds));
  }

  if (opts.veiculoId?.trim()) {
    const id = opts.veiculoId.trim();
    items = items.filter((d) => d.veiculoId === id || veiculoDaDespesa(d)?.id === id);
  } else if (opts.placa?.trim()) {
    const v = findVeiculoByPlaca(opts.placa);
    const placaNorm = opts.placa.trim().toUpperCase();
    items = items.filter(
      (d) =>
        d.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") === placaNorm.replace(/[^A-Z0-9]/g, "") ||
        (v && d.veiculoId === v.id),
    );
  }

  if (opts.categoria?.trim()) {
    const cat = opts.categoria.trim().toLowerCase();
    items = items.filter((d) => d.categoria.trim().toLowerCase() === cat);
  }

  if (opts.competencia?.trim()) {
    items = items.filter((d) => d.competencia === opts.competencia!.trim());
  }

  if (opts.veiculoAtivo === true) {
    items = items.filter((d) => {
      const veiculo = veiculoDaDespesa(d);
      return veiculo ? isVeiculoAtivo(veiculo) : false;
    });
  } else if (opts.veiculoAtivo === false) {
    items = items.filter((d) => {
      const veiculo = veiculoDaDespesa(d);
      return veiculo ? !isVeiculoAtivo(veiculo) : true;
    });
  }

  if (opts.emAberto === true) items = items.filter(emAberto);
  else if (opts.emAberto === false) items = items.filter((d) => !emAberto(d));

  return { total: items.length, items };
}

export function obterParceiroDespesa(id: string): ParceiroDespesaRegistro | null {
  return loadParceiroDespesasDb().parceiroDespesas.find((d) => d.id === id) ?? null;
}

export function criarParceiroDespesa(input: ParceiroDespesaInput) {
  if (!input.placa?.trim()) throw new HttpError(400, 'Campo "placa" é obrigatório');
  if (!input.categoria?.trim()) throw new HttpError(400, 'Campo "categoria" é obrigatório');
  return gravarParceiroDespesaManual(input);
}

export function atualizarParceiroDespesa(
  id: string,
  patch: Partial<Pick<ParceiroDespesaRegistro, "categoria" | "descricao" | "data" | "valor" | "competencia" | "baixa">>,
) {
  const db = loadParceiroDespesasDb();
  const idx = db.parceiroDespesas.findIndex((d) => d.id === id);
  if (idx < 0) throw new HttpError(404, "Despesa parceiro não encontrada");
  const reg = db.parceiroDespesas[idx]!;
  Object.assign(reg, patch);
  db.parceiroDespesas[idx] = reg;
  saveParceiroDespesasDb(db);
  return reg;
}

export function baixarParceiroDespesa(
  seletor: { id?: string; placa?: string; categoria?: string; competencia?: string },
  opts?: { data?: string; desfazer?: boolean },
) {
  const r = marcarBaixaParceiroDespesa(seletor, opts);
  if (!r.atualizados.length && !r.semAlteracao.length) {
    throw new HttpError(404, "Nenhuma despesa encontrada para o seletor");
  }
  return r;
}

export function removerParceiroDespesa(id: string): ParceiroDespesaRegistro {
  const db = loadParceiroDespesasDb();
  const idx = db.parceiroDespesas.findIndex((d) => d.id === id);
  if (idx < 0) throw new HttpError(404, "Despesa parceiro não encontrada");
  const [removido] = db.parceiroDespesas.splice(idx, 1);
  saveParceiroDespesasDb(db);
  return removido!;
}

export function lancarRastreador(opts: {
  desde?: string;
  ate?: string;
  dryRun?: boolean;
}) {
  return lancarRastreadorFixo({
    desde: opts.desde ?? "01/2026",
    ate: opts.ate,
    dryRun: opts.dryRun,
  });
}
