/**
 * Sync FIPE → PostgreSQL (`lanza.veiculo_fipe`).
 * Sem marca/ano: fallback https://placafipebrasil.com.br/placa-fipe/{PLACA}
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
import {
  consultarPlacaFipeBrasil,
  fipeFieldsFromPlacaFipeBrasil,
  urlPlacaFipeBrasil,
} from "./placaFipeBrasil.js";
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
  fonte?: "parallelum" | "placafipebrasil";
  erro?: string;
};

export type FipeSyncProgress = {
  total: number;
  done: number;
  percent: number;
  sucesso: number;
  falhas: number;
  resultados: FipeSyncResultadoLinha[];
};

export type SincronizarFipeOpts = {
  placa?: string;
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

function temMarcaAno(v: VeiculoRegistro): boolean {
  const marcaModelo =
    String(v.marcaModelo ?? "").trim() ||
    [v.marca, v.modelo].filter(Boolean).join("/");
  const ano = String(v.anoModelo ?? "").trim() || (v.ano != null ? String(v.ano) : "");
  return Boolean(marcaModelo) && Boolean(ano);
}

async function resolverFipeComFallback(
  v: VeiculoRegistro,
  brands: Awaited<ReturnType<typeof listarMarcas>>,
) {
  if (temMarcaAno(v)) {
    try {
      const upd = await resolverFipeVeiculo(v, brands);
      return { upd, fonte: "parallelum" as const, scraped: null as null };
    } catch {
      /* fallback */
    }
  }
  const scraped = await consultarPlacaFipeBrasil(v.placa);
  const upd = {
    ...fipeFieldsFromPlacaFipeBrasil(scraped),
    ...(scraped.marcaModelo && !String(v.marcaModelo ?? "").trim()
      ? { marcaModelo: scraped.marcaModelo }
      : {}),
    ...(scraped.anoModelo && !String(v.anoModelo ?? "").trim()
      ? { anoModelo: scraped.anoModelo }
      : {}),
    ...(scraped.marca && !String(v.marca ?? "").trim() ? { marca: scraped.marca } : {}),
    ...(scraped.modelo && !String(v.modelo ?? "").trim() ? { modelo: scraped.modelo } : {}),
  };
  return { upd, fonte: "placafipebrasil" as const, scraped };
}

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
      const { upd, fonte, scraped } = await resolverFipeComFallback(v, brands);
      await editarVeiculoAsync(v.id, upd);
      resultados.push({
        ...base,
        marcaModelo: scraped?.marcaModelo ?? base.marcaModelo,
        anoModelo: scraped?.anoModelo ?? base.anoModelo,
        ok: true,
        fipeCodigo: upd.fipeCodigo,
        fipeModelo: upd.fipeModelo,
        fipeValor: upd.fipeValor,
        fipeReferencia: upd.fipeReferencia,
        fipe: upd.fipe ?? (fonte === "placafipebrasil" ? urlPlacaFipeBrasil(v.placa) : undefined),
        fonte,
      });
      sucesso++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({
        ...base,
        ok: false,
        erro: msg,
        fipe: urlPlacaFipeBrasil(v.placa),
      });
      falhas++;
    }
    emitProgress(opts.onProgress, total, sucesso + falhas, sucesso, falhas, resultados);
  }

  return { total, sucesso, falhas, resultados };
}
