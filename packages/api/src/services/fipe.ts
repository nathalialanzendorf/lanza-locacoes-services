import {
  consultarValor,
  editarVeiculoAsync,
  listarAnos,
  listarMarcas,
  listarModelos,
  loadVeiculosDbAsync,
  montarUrlFipe,
  placasIguais,
  resolverFipeVeiculo,
  sincronizarFipeVeiculos,
  consultarPlacaFipeBrasil,
  fipeFieldsFromPlacaFipeBrasil,
  urlPlacaFipeBrasil,
  type FipeSyncProgress,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import { assertRelationalStore } from "@lanza/db";

export async function listarMarcasFipe(filtro?: string) {
  const brands = await listarMarcas();
  const f = filtro?.trim().toLowerCase();
  const items = f
    ? brands.filter((b) => b.name.toLowerCase().includes(f))
    : brands;
  return { total: items.length, items };
}

export async function listarModelosFipe(marcaCode: string, filtro?: string) {
  const models = await listarModelos(marcaCode);
  const words = filtro?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const items =
    words.length === 0
      ? models
      : models.filter((m) => {
          const n = m.name.toLowerCase();
          return words.every((w) => n.includes(w));
        });
  return { total: items.length, items };
}

export async function listarAnosFipe(marcaCode: string, modeloCode: string, filtro?: string) {
  const years = await listarAnos(marcaCode, modeloCode);
  const words = filtro?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const items =
    words.length === 0
      ? years
      : years.filter((y) => {
          const n = y.name.toLowerCase();
          return words.every((w) => n.includes(w));
        });
  return { total: items.length, items };
}

export async function consultarValorFipe(marcaCode: string, modeloCode: string, anoCode: string) {
  const d = await consultarValor(marcaCode, modeloCode, anoCode);
  return {
    fipeCodigo: d.codeFipe,
    fipeModelo: d.model,
    price: d.price,
    modelYear: d.modelYear,
    fuel: d.fuel,
    referenceMonth: d.referenceMonth,
    url: montarUrlFipe(d),
  };
}

async function resolverVeiculo(idOuPlaca: string) {
  const db = await loadVeiculosDbAsync({ comFipe: true });
  const byId = db.veiculos.find((v) => v.id === idOuPlaca);
  if (byId) return byId;
  const byPlaca = db.veiculos.find((v) => placasIguais(v.placa, idOuPlaca));
  if (byPlaca) return byPlaca;
  throw new HttpError(404, `Veículo não encontrado: ${idOuPlaca}`);
}

export type ConsultarFipeInput = {
  placa: string;
  marcaModelo?: string;
  anoModelo?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  /** Grava em PostgreSQL (`lanza.veiculo_fipe`) se o veículo já estiver cadastrado. */
  persist?: boolean;
};

async function fipePorPlacaFipeBrasil(placa: string) {
  const scraped = await consultarPlacaFipeBrasil(placa);
  return {
    data: {
      placa,
      marcaModelo: scraped.marcaModelo,
      anoModelo: scraped.anoModelo,
      marca: scraped.marca,
      modelo: scraped.modelo,
      cor: scraped.cor,
    },
    fipe: {
      ...fipeFieldsFromPlacaFipeBrasil(scraped),
      fonte: "placafipebrasil" as const,
      url: scraped.url,
      opcoes: scraped.opcoes,
    },
    fonte: "placafipebrasil" as const,
    url: scraped.url,
  };
}

export async function consultarFipeVeiculo(input: ConsultarFipeInput) {
  const placa = input.placa?.trim();
  if (!placa) throw new HttpError(400, "Informe a placa.");

  const brands = await listarMarcas();
  const db = await loadVeiculosDbAsync({ comFipe: true });
  const cadastrado =
    db.veiculos.find((v) => placasIguais(v.placa, placa)) ??
    db.veiculos.find((v) => v.id === placa) ??
    null;

  if (cadastrado) {
    try {
      const fipe = await resolverFipeVeiculo(cadastrado, brands);
      if (input.persist) {
        await assertRelationalStore();
        const data = await editarVeiculoAsync(cadastrado.id, fipe);
        return { cadastrado: true as const, data, fipe, fonte: "parallelum" as const };
      }
      return { cadastrado: true as const, data: cadastrado, fipe, fonte: "parallelum" as const };
    } catch {
      const scraped = await consultarPlacaFipeBrasil(placa);
      const fipe = {
        ...fipeFieldsFromPlacaFipeBrasil(scraped),
        fonte: "placafipebrasil" as const,
        url: scraped.url,
        opcoes: scraped.opcoes,
      };
      if (input.persist) {
        await assertRelationalStore();
        const data = await editarVeiculoAsync(cadastrado.id, {
          ...fipeFieldsFromPlacaFipeBrasil(scraped),
          ...(scraped.marcaModelo && !String(cadastrado.marcaModelo ?? "").trim()
            ? { marcaModelo: scraped.marcaModelo }
            : {}),
          ...(scraped.anoModelo && !String(cadastrado.anoModelo ?? "").trim()
            ? { anoModelo: scraped.anoModelo }
            : {}),
        });
        return { cadastrado: true as const, data, fipe, fonte: "placafipebrasil" as const, url: scraped.url };
      }
      return {
        cadastrado: true as const,
        data: { ...cadastrado, marcaModelo: scraped.marcaModelo ?? cadastrado.marcaModelo, anoModelo: scraped.anoModelo ?? cadastrado.anoModelo },
        fipe,
        fonte: "placafipebrasil" as const,
        url: scraped.url,
      };
    }
  }

  const marcaModelo = input.marcaModelo?.trim();
  const marca = input.marca?.trim();
  const anoModelo = input.anoModelo?.trim();
  const ano = input.ano;
  const temDadosManual =
    Boolean(marcaModelo) || (Boolean(marca) && Boolean(anoModelo || ano));

  if (!temDadosManual) {
    try {
      const r = await fipePorPlacaFipeBrasil(placa);
      return { cadastrado: false as const, ...r };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        404,
        `${msg} — tente em ${urlPlacaFipeBrasil(placa)} ou informe marca/modelo e ano.`,
      );
    }
  }

  const data = {
    placa,
    marcaModelo,
    anoModelo,
    marca,
    modelo: input.modelo?.trim(),
    ano,
  };
  try {
    const fipe = await resolverFipeVeiculo(data, brands);
    return { cadastrado: false as const, data, fipe, fonte: "parallelum" as const };
  } catch {
    const r = await fipePorPlacaFipeBrasil(placa);
    return { cadastrado: false as const, ...r };
  }
}

export async function atualizarFipeVeiculo(idOuPlaca: string) {
  await assertRelationalStore();
  const r = await sincronizarFipeVeiculos({ placa: idOuPlaca });
  const linha = r.resultados[0];
  if (!linha?.ok) {
    throw new HttpError(400, linha?.erro ?? `Falha ao atualizar FIPE: ${idOuPlaca}`);
  }
  const v = await resolverVeiculo(idOuPlaca);
  return {
    data: v,
    fipe: {
      fipe: linha.fipe,
      fipeCodigo: linha.fipeCodigo,
      fipeModelo: linha.fipeModelo,
      fipeValor: linha.fipeValor,
      fipeReferencia: linha.fipeReferencia,
    },
    fonte: linha.fonte,
  };
}

export async function atualizarFipeFrota(onProgress?: (p: FipeSyncProgress) => void) {
  return sincronizarFipeVeiculos({ onProgress });
}

export async function atualizarFipeFaltantes(onProgress?: (p: FipeSyncProgress) => void) {
  return sincronizarFipeVeiculos({ faltantes: true, onProgress });
}
