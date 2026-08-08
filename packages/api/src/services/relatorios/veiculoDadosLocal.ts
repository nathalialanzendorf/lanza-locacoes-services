/**
 * Dados do veículo a partir do PostgreSQL (resultado de syncs) — sem consulta live aos portais.
 */
import {
  compactPlaca,
  findVeiculoByPlaca,
  formatPlacaHyphen,
  isCategoriaEstacionamento,
  isCategoriaPedagio,
  isClienteDespesaEmAberto,
  loadVeiculosDbAsync,
  placasIguais,
  type InfracaoRegistro,
  type ParceiroDespesaRegistro,
  type VeiculoRegistro,
} from "../../lib-imports.js";
import { ufRegistroDaPlaca } from "../../lib-imports.js";
import * as despesasService from "../despesas.js";
import * as infracoesService from "../infracoes.js";
import * as parceiroDespesasService from "../parceiroDespesas.js";
import type {
  VeiculoConsultaPortalItem,
  VeiculoConsultaResultado,
  VeiculoConsultaSecao,
} from "./veiculoConsulta.js";

const emptySecao = (): VeiculoConsultaSecao<VeiculoConsultaPortalItem> => ({
  total: 0,
  valorTotal: 0,
  items: [],
});

function somaValor(items: VeiculoConsultaPortalItem[]): number {
  return Math.round(items.reduce((s, i) => s + (Number(i.valor) || 0), 0) * 100) / 100;
}

function infracaoEmAberto(i: InfracaoRegistro): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

function placaDoVeiculo(v: VeiculoRegistro): string {
  return formatPlacaHyphen(v.placa);
}

function pertenceVeiculo(
  refPlacaOuId: string | undefined | null,
  veiculo: VeiculoRegistro,
): boolean {
  if (!refPlacaOuId?.trim()) return false;
  const ref = refPlacaOuId.trim();
  if (ref === veiculo.id) return true;
  return placasIguais(ref, veiculo.placa);
}

function pertenceFrota(
  refPlacaOuId: string | undefined | null,
  veiculos: VeiculoRegistro[],
): VeiculoRegistro | null {
  for (const v of veiculos) {
    if (pertenceVeiculo(refPlacaOuId, v)) return v;
  }
  return null;
}

function mapInfracao(i: InfracaoRegistro, placa: string): VeiculoConsultaPortalItem {
  return {
    id: i.id,
    ref: i.numeroAuto,
    placa,
    descricao: i.descricao,
    local: i.localInfracao || null,
    data: i.dataAutuacao || null,
    valor: Number(i.valor ?? i.valorMulta) || 0,
    situacao: i.situacao || i.status || "—",
    emAberto: infracaoEmAberto(i),
    fonte: "lanza-db/infracoes",
  };
}

function mapClienteDespesa(
  d: despesasService.DespesaClienteListagem,
  placa: string,
  fonte: string,
): VeiculoConsultaPortalItem {
  return {
    id: d.id,
    ref: d.autoInfracao?.trim() || d.id,
    placa,
    descricao: d.descricao?.trim() || d.titulo?.trim() || d.categoria || "Despesa",
    local: d.localInfracao ?? null,
    data: d.dataAutuacao ?? d.vencimentoBr ?? null,
    valor: Number(d.valorMulta) || 0,
    situacao: d.situacao?.trim() || (isClienteDespesaEmAberto(d) ? "Em aberto" : "Pago"),
    emAberto: isClienteDespesaEmAberto(d),
    fonte,
  };
}

function mapParceiroDespesa(d: ParceiroDespesaRegistro, placa: string): VeiculoConsultaPortalItem {
  const aberto = !String(d.baixa ?? "").trim();
  return {
    id: d.id,
    ref: d.origem?.split("/").pop() ?? d.id,
    placa,
    descricao: d.descricao?.trim() || d.categoria || "Despesa parceiro",
    local: null,
    data: d.data || d.competencia || null,
    valor: Number(d.valor) || 0,
    situacao: aberto ? "Em aberto" : "Pago",
    emAberto: aberto,
    fonte: "lanza-db/parceiro-despesas",
  };
}

function ufDoVeiculo(veiculo: VeiculoRegistro): string {
  const uf =
    (typeof veiculo.ufRegistro === "string" ? veiculo.ufRegistro.trim() : "") ||
    ufRegistroDaPlaca(veiculo.placa) ||
    "SC";
  return uf.toUpperCase();
}

function ufRegistroVeiculo(veiculo: VeiculoRegistro): string | null {
  return (
    (typeof veiculo.ufRegistro === "string" ? veiculo.ufRegistro.trim() : "") ||
    ufRegistroDaPlaca(veiculo.placa) ||
    null
  );
}

function secaoFromItems(items: VeiculoConsultaPortalItem[]): VeiculoConsultaSecao<VeiculoConsultaPortalItem> {
  return { total: items.length, valorTotal: somaValor(items), items };
}

export async function consultarVeiculoDadosLocal(opts: {
  placa?: string;
}): Promise<VeiculoConsultaResultado> {
  const placaNorm = compactPlaca(opts.placa ?? "");
  const frota = !placaNorm;

  const { veiculos: todosVeiculos } = await loadVeiculosDbAsync();
  const veiculosAlvo = frota
    ? todosVeiculos.filter((v) => v.ativo !== false)
    : (() => {
        const v = findVeiculoByPlaca(placaNorm) ?? todosVeiculos.find((x) => placasIguais(x.placa, placaNorm));
        return v ? [v] : [];
      })();

  if (!frota && !veiculosAlvo.length) {
    return {
      modo: "veiculo",
      placa: formatPlacaHyphen(placaNorm),
      renavam: null,
      ufRegistro: ufRegistroDaPlaca(placaNorm),
      veiculoCadastrado: false,
      veiculosConsultados: 0,
      fonte: "todos",
      detranSc: emptySecao(),
      detranRs: emptySecao(),
      pedagio: emptySecao(),
      estacionamento: emptySecao(),
    };
  }

  const [infracoesR, despesasR, parceiroR] = await Promise.all([
    infracoesService.listarInfracoesAsync({ ativo: true }),
    despesasService.listarDespesasAsync({ ativo: true }),
    parceiroDespesasService.listarParceiroDespesas({ veiculoAtivo: true }),
  ]);

  const detranScItems: VeiculoConsultaPortalItem[] = [];
  const detranRsItems: VeiculoConsultaPortalItem[] = [];
  const pedagioItems: VeiculoConsultaPortalItem[] = [];
  const estacionamentoItems: VeiculoConsultaPortalItem[] = [];

  for (const i of infracoesR.items) {
    const veiculo = pertenceFrota(i.veiculoId, veiculosAlvo);
    if (!veiculo) continue;
    const placa = placaDoVeiculo(veiculo);
    const uf = ufDoVeiculo(veiculo);
    const item = mapInfracao(i, placa);
    if (uf === "RS") detranRsItems.push(item);
    else detranScItems.push(item);
  }

  for (const d of despesasR.items) {
    const veiculo =
      (d.veiculoId && veiculosAlvo.find((v) => v.id === d.veiculoId)) ||
      pertenceFrota(d.placa, veiculosAlvo);
    if (!veiculo) continue;
    const placa = placaDoVeiculo(veiculo);
    if (isCategoriaPedagio(d.categoria)) {
      pedagioItems.push(mapClienteDespesa(d, placa, "lanza-db/pedagio"));
    } else if (isCategoriaEstacionamento(d.categoria)) {
      estacionamentoItems.push(mapClienteDespesa(d, placa, "lanza-db/sigapay"));
    }
  }

  for (const d of parceiroR.items) {
    const veiculo =
      (d.veiculoId && veiculosAlvo.find((v) => v.id === d.veiculoId)) ||
      pertenceFrota(d.placa, veiculosAlvo);
    if (!veiculo) continue;
    if (!String(d.origem ?? "").includes("detran-rs")) continue;
    detranRsItems.push(mapParceiroDespesa(d, placaDoVeiculo(veiculo)));
  }

  const veiculo = veiculosAlvo.length === 1 ? veiculosAlvo[0]! : null;

  return {
    modo: frota ? "frota" : "veiculo",
    placa: frota ? "Frota activa" : placaDoVeiculo(veiculo!),
    renavam: veiculo?.renavam?.trim() || null,
    ufRegistro: veiculo ? ufRegistroVeiculo(veiculo) : null,
    veiculoCadastrado: frota ? true : Boolean(veiculo),
    veiculosConsultados: veiculosAlvo.length,
    fonte: "todos",
    detranSc: secaoFromItems(detranScItems),
    detranRs: secaoFromItems(detranRsItems),
    pedagio: secaoFromItems(pedagioItems),
    estacionamento: secaoFromItems(estacionamentoItems),
  };
}
