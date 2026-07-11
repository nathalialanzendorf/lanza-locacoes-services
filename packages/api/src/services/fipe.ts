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
