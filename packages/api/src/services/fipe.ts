import {
  consultarValor,
  editarVeiculo,
  findVeiculoById,
  findVeiculoByPlaca,
  isVeiculoAtivo,
  listarAnos,
  listarMarcas,
  listarModelos,
  loadVeiculosDb,
  montarUrlFipe,
  resolverFipeVeiculo,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

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

function resolverVeiculo(idOuPlaca: string) {
  const byId = findVeiculoById(idOuPlaca);
  if (byId) return byId;
  const byPlaca = findVeiculoByPlaca(idOuPlaca);
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
  /** Grava em veiculos.json se o veículo já estiver cadastrado (default false). */
  persist?: boolean;
};

export async function consultarFipeVeiculo(input: ConsultarFipeInput) {
  const placa = input.placa?.trim();
  if (!placa) throw new HttpError(400, "Informe a placa.");

  const brands = await listarMarcas();
  const cadastrado = findVeiculoByPlaca(placa) ?? findVeiculoById(placa);

  if (cadastrado) {
    const fipe = await resolverFipeVeiculo(cadastrado, brands);
    if (input.persist) {
      const data = editarVeiculo(cadastrado.id, fipe);
      return { cadastrado: true as const, data, fipe };
    }
    return { cadastrado: true as const, data: cadastrado, fipe };
  }

  const marcaModelo = input.marcaModelo?.trim();
  const marca = input.marca?.trim();
  const anoModelo = input.anoModelo?.trim();
  const ano = input.ano;
  const temDadosManual =
    Boolean(marcaModelo) || (Boolean(marca) && Boolean(anoModelo || ano));

  if (!temDadosManual) {
    throw new HttpError(
      404,
      "Veículo não cadastrado. Informe marca/modelo (ex.: VW/GOL) e ano (ex.: 2018/2018).",
    );
  }

  const data = {
    placa,
    marcaModelo,
    anoModelo,
    marca,
    modelo: input.modelo?.trim(),
    ano,
  };
  const fipe = await resolverFipeVeiculo(data, brands);
  return { cadastrado: false as const, data, fipe };
}

export async function atualizarFipeVeiculo(idOuPlaca: string) {
  const v = resolverVeiculo(idOuPlaca);
  const brands = await listarMarcas();
  const upd = await resolverFipeVeiculo(v, brands);
  const data = editarVeiculo(v.id, upd);
  return { data, fipe: upd };
}

export async function atualizarFipeFrota() {
  const brands = await listarMarcas();
  const veiculos = loadVeiculosDb().veiculos.filter(isVeiculoAtivo);
  const resultados: Array<{ placa: string; ok: boolean; fipe?: unknown; erro?: string }> = [];

  for (const v of veiculos) {
    try {
      const upd = await resolverFipeVeiculo(v, brands);
      editarVeiculo(v.id, upd);
      resultados.push({ placa: v.placa, ok: true, fipe: upd });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ placa: v.placa, ok: false, erro: msg });
    }
  }

  return {
    total: veiculos.length,
    sucesso: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}
