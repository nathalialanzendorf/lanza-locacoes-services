import {
  findVeiculoById,
  findVeiculoByPlaca,
  formatPlacaHyphen,
  formatVeiculoLabel,
  gravarParceiroDespesaManualAsync,
  isVeiculoAtivo,
  lancarRastreadorFixo,
  loadParceiroDespesasDbAsync,
  loadVeiculosDbAsync,
  marcarBaixaParceiroDespesaAsync,
  resolveVeiculoIdListagem,
  saveParceiroDespesasDbAsync,
  type ParceiroDespesaInput,
  type ParceiroDespesaRegistro,
  isEntityUuid,
  type VeiculoRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { queryParceiroDespesasFromSql, queryVeiculosByIdsFromSql, resolveVeiculoIdFromSql, useRelationalStore } from "@lanza/db";
import { listarVinculosAsync } from "./parceiros.js";
import { dataStringNoPeriodo } from "../lib-imports.js";

export type ListarParceiroDespesasOpts = {
  placa?: string;
  veiculoId?: string;
  parceiroId?: string;
  categoria?: string;
  competencia?: string;
  emAberto?: boolean;
  veiculoAtivo?: boolean;
  dataInicial?: string;
  dataFinal?: string;
};

function emAberto(d: ParceiroDespesaRegistro): boolean {
  return !String(d.baixa ?? "").trim();
}

function veiculoDaDespesa(d: ParceiroDespesaRegistro, veiculos: VeiculoRegistro[]) {
  if (d.veiculoId) {
    return veiculos.find((v) => v.id === d.veiculoId) ?? findVeiculoById(d.veiculoId);
  }
  if (d.placa) {
    return (
      veiculos.find((v) => formatPlacaHyphen(v.placa) === formatPlacaHyphen(d.placa)) ??
      findVeiculoByPlaca(d.placa)
    );
  }
  return null;
}

async function veiculoIdsDoParceiro(parceiroId: string): Promise<Set<string>> {
  const vinculos = await listarVinculosAsync({ parceiroId });
  return new Set(vinculos.items.map((v) => v.veiculoId));
}

function despesaDoParceiro(d: ParceiroDespesaRegistro, veiculoIds: Set<string>, veiculos: VeiculoRegistro[]): boolean {
  if (d.veiculoId && veiculoIds.has(d.veiculoId)) return true;
  const veiculo = veiculoDaDespesa(d, veiculos);
  return veiculo ? veiculoIds.has(veiculo.id) : false;
}

export type ParceiroDespesaListagem = ParceiroDespesaRegistro & {
  veiculoLabel: string;
  vencimentoBr: string | null;
};

function enriquecerParceiroDespesa(
  d: ParceiroDespesaRegistro,
  veiculos: VeiculoRegistro[],
): ParceiroDespesaListagem {
  const veiculo = veiculoDaDespesa(d, veiculos);
  const placa = veiculo?.placa ?? formatPlacaHyphen(d.placa);
  return {
    ...d,
    placa,
    veiculoLabel: formatVeiculoLabel(veiculo ?? { placa }),
    vencimentoBr: d.data?.trim() || null,
  };
}

export async function listarParceiroDespesas(opts: ListarParceiroDespesasOpts = {}) {
  let items: ParceiroDespesaRegistro[];
  let veiculos: VeiculoRegistro[];

  if (await useRelationalStore()) {
    const veiculoId =
      opts.veiculoId?.trim() ||
      (opts.placa?.trim()
        ? ((await resolveVeiculoIdFromSql({ placa: opts.placa })) ?? undefined)
        : undefined);
    items = (await queryParceiroDespesasFromSql({
      veiculoId,
      parceiroId: opts.parceiroId,
      categoria: opts.categoria,
      competencia: opts.competencia,
      emAberto: opts.emAberto,
      veiculoAtivo: opts.veiculoAtivo,
    })) as ParceiroDespesaRegistro[];
    const veiculoIds = new Set<string>();
    if (veiculoId) veiculoIds.add(veiculoId);
    for (const d of items) {
      const id = String(d.veiculoId ?? "").trim();
      if (isEntityUuid(id)) veiculoIds.add(id);
    }
    veiculos =
      veiculoIds.size > 0
        ? ((await queryVeiculosByIdsFromSql([...veiculoIds])) as VeiculoRegistro[])
        : [];
  } else {
    veiculos = (await loadVeiculosDbAsync()).veiculos;
    const despesasDb = await loadParceiroDespesasDbAsync();
    items = despesasDb.parceiroDespesas;

    if (opts.parceiroId?.trim()) {
      const veiculoIds = await veiculoIdsDoParceiro(opts.parceiroId.trim());
      items = items.filter((d) => despesaDoParceiro(d, veiculoIds, veiculos));
    }

    if (opts.veiculoId?.trim()) {
      const id = opts.veiculoId.trim();
      items = items.filter((d) => d.veiculoId === id || veiculoDaDespesa(d, veiculos)?.id === id);
    } else if (opts.placa?.trim()) {
      const v = veiculoDaDespesa({ placa: opts.placa } as ParceiroDespesaRegistro, veiculos);
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
        const veiculo = veiculoDaDespesa(d, veiculos);
        return veiculo ? isVeiculoAtivo(veiculo) : false;
      });
    } else if (opts.veiculoAtivo === false) {
      items = items.filter((d) => {
        const veiculo = veiculoDaDespesa(d, veiculos);
        return veiculo ? !isVeiculoAtivo(veiculo) : true;
      });
    }

    if (opts.emAberto === true) items = items.filter(emAberto);
    else if (opts.emAberto === false) items = items.filter((d) => !emAberto(d));
  }

  if (opts.dataInicial?.trim() || opts.dataFinal?.trim()) {
    items = items.filter((d) =>
      dataStringNoPeriodo(d.data, {
        dataInicial: opts.dataInicial,
        dataFinal: opts.dataFinal,
      }),
    );
  }

  return {
    total: items.length,
    items: items.map((d) => enriquecerParceiroDespesa(d, veiculos)),
  };
}

export async function obterParceiroDespesa(id: string): Promise<ParceiroDespesaRegistro | null> {
  const db = await loadParceiroDespesasDbAsync();
  return db.parceiroDespesas.find((d) => d.id === id) ?? null;
}

export async function criarParceiroDespesa(input: ParceiroDespesaInput) {
  if (!input.veiculoId?.trim() && !input.placa?.trim()) {
    throw new HttpError(400, 'Informe "veiculoId" ou "placa"');
  }
  if (!input.categoria?.trim()) throw new HttpError(400, 'Campo "categoria" é obrigatório');
  return gravarParceiroDespesaManualAsync(input);
}

export async function atualizarParceiroDespesa(
  id: string,
  patch: Partial<Pick<ParceiroDespesaRegistro, "categoria" | "descricao" | "data" | "valor" | "competencia" | "baixa">>,
) {
  const db = await loadParceiroDespesasDbAsync();
  const idx = db.parceiroDespesas.findIndex((d) => d.id === id);
  if (idx < 0) throw new HttpError(404, "Despesa parceiro não encontrada");
  const reg = db.parceiroDespesas[idx]!;
  Object.assign(reg, patch);
  db.parceiroDespesas[idx] = reg;
  await saveParceiroDespesasDbAsync(db);
  return reg;
}

export async function baixarParceiroDespesa(
  seletor: { id?: string; placa?: string; categoria?: string; competencia?: string },
  opts?: { data?: string; desfazer?: boolean },
) {
  const r = await marcarBaixaParceiroDespesaAsync(seletor, opts);
  if (!r.atualizados.length && !r.semAlteracao.length) {
    throw new HttpError(404, "Nenhuma despesa encontrada para o seletor");
  }
  return r;
}

export async function removerParceiroDespesa(id: string): Promise<ParceiroDespesaRegistro> {
  const db = await loadParceiroDespesasDbAsync();
  const idx = db.parceiroDespesas.findIndex((d) => d.id === id);
  if (idx < 0) throw new HttpError(404, "Despesa parceiro não encontrada");
  const [removido] = db.parceiroDespesas.splice(idx, 1);
  await saveParceiroDespesasDbAsync(db);
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
