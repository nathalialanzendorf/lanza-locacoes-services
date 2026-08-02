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

export type FipeSyncResultadoLinha = {
  placa: string;
  marcaModelo?: string;
  anoModelo?: string;
  ok: boolean;
  fipeCodigo?: string;
  fipeModelo?: string;
  fipeValor?: string;
  fipeReferencia?: string;
  fipe?: string;
  erro?: string;
};

export type FipeSyncProgress = {
  total: number;
  done: number;
  percent: number;
  sucesso: number;
  falhas: number;
  /** Resultados acumulados (para exibir em tela durante o job). */
  resultados: FipeSyncResultadoLinha[];
};

export type SincronizarFipeOpts = {
  /** Uma placa (ou id). Inclui inativos. */
  placa?: string;
  /** Só veículos sem FIPE (ativos e inativos). */
  faltantes?: boolean;
  onProgress?: (p: FipeSyncProgress) => void;
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
  resultados: FipeSyncResultadoLinha[],
): void {
  onProgress?.({
    total,
    done,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    sucesso,
    falhas,
    resultados,
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

  emitProgress(opts.onProgress, total, 0, 0, 0, resultados);

  for (const v of veiculos) {
    const base = {
      placa: v.placa,
      marcaModelo: v.marcaModelo ?? ([v.marca, v.modelo].filter(Boolean).join("/") || undefined),
      anoModelo: v.anoModelo ?? (v.ano != null ? String(v.ano) : undefined),
    };
    try {
      const upd = await resolverFipeVeiculo(v, brands);
      await editarVeiculoAsync(v.id, upd);
      resultados.push({
        ...base,
        ok: true,
        fipeCodigo: upd.fipeCodigo,
        fipeModelo: upd.fipeModelo,
        fipeValor: upd.fipeValor,
        fipeReferencia: upd.fipeReferencia,
        fipe: upd.fipe,
      });
      sucesso++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ ...base, ok: false, erro: msg });
      falhas++;
    }
    emitProgress(opts.onProgress, total, sucesso + falhas, sucesso, falhas, resultados);
  }

  return { total, sucesso, falhas, resultados };
}
