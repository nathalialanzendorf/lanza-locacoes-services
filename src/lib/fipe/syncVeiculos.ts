/**
 * Sync FIPE → PostgreSQL (`lanza.veiculo_fipe`).
 * Não usa `database/veiculos.json`.
 */
import { assertRelationalStore } from "@lanza/db";
import {
  editarVeiculoAsync,
  loadVeiculosDbAsync,
  precisaFipe,
  type VeiculoRegistro,
} from "../veiculosDb.js";
import { placasIguais } from "../placa.js";
import { listarMarcas } from "./consulta.js";
import { resolverFipeVeiculo } from "./resolverVeiculo.js";

export type FipeSyncProgress = {
  total: number;
  done: number;
  percent: number;
  sucesso: number;
  falhas: number;
};

export type SincronizarFipeOpts = {
  /** Uma placa (ou id). Inclui inativos. */
  placa?: string;
  /** Só veículos sem FIPE (ativos e inativos). */
  faltantes?: boolean;
  onProgress?: (p: FipeSyncProgress) => void;
};

export type FipeSyncResultadoLinha = {
  placa: string;
  ok: boolean;
  fipe?: unknown;
  erro?: string;
};

export type FipeSyncResult = {
  total: number;
  sucesso: number;
  falhas: number;
  resultados: FipeSyncResultadoLinha[];
};

function emitProgress(
  onProgress: SincronizarFipeOpts["onProgress"],
  total: number,
  done: number,
  sucesso: number,
  falhas: number,
): void {
  onProgress?.({
    total,
    done,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    sucesso,
    falhas,
  });
}

/**
 * Consulta a Tabela FIPE e grava em PostgreSQL para a frota (ou uma placa).
 * Inclui veículos ativos e inativos. Exige backend relacional.
 */
export async function sincronizarFipeVeiculos(
  opts: SincronizarFipeOpts = {},
): Promise<FipeSyncResult> {
  await assertRelationalStore();

  const brands = await listarMarcas();
  const db = await loadVeiculosDbAsync({ comFipe: true });
  let veiculos: VeiculoRegistro[] = db.veiculos;

  const placaFiltro = opts.placa?.trim();
  if (placaFiltro) {
    veiculos = veiculos.filter(
      (v) => placasIguais(v.placa, placaFiltro) || v.id === placaFiltro,
    );
    if (veiculos.length === 0) {
      throw new Error(`Veículo não encontrado: ${placaFiltro}`);
    }
  } else if (opts.faltantes) {
    veiculos = veiculos.filter(precisaFipe);
  }

  const total = veiculos.length;
  const resultados: FipeSyncResultadoLinha[] = [];
  let sucesso = 0;
  let falhas = 0;

  emitProgress(opts.onProgress, total, 0, 0, 0);

  for (const v of veiculos) {
    try {
      const upd = await resolverFipeVeiculo(v, brands);
      await editarVeiculoAsync(v.id, upd);
      resultados.push({ placa: v.placa, ok: true, fipe: upd });
      sucesso++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ placa: v.placa, ok: false, erro: msg });
      falhas++;
    }
    emitProgress(opts.onProgress, total, sucesso + falhas, sucesso, falhas);
  }

  return { total, sucesso, falhas, resultados };
}
