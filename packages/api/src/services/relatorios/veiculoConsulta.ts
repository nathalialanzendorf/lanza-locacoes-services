import {
  findVeiculoByPlaca,
  formatPlacaHyphen,
  loadVeiculosDb,
  ufRegistroDaPlaca,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";
import * as estacionamentoService from "../estacionamento.js";
import * as pedagioService from "../pedagio.js";
import { consultarVeiculoDetranSc } from "../../../../../src/lib/detranSc/consulta.js";
import { extrairMultasDetranSc } from "../../../../../src/lib/detranSc/mapInfracoes.js";
import type { DetranScMultaNormalizada } from "../../../../../src/lib/detranSc/types.js";
import { consultarVeiculoDetranRs } from "../../../../../src/lib/detranRs/consulta.js";
import { extrairInfracoesResumoDetranRs } from "../../../../../src/lib/detranRs/mapDebitos.js";

export type VeiculoConsultaFonte = "detran-sc" | "detran-rs" | "pedagio" | "sigapay";

export type VeiculoConsultaPortalItem = {
  id: string;
  ref?: string;
  descricao: string;
  local?: string | null;
  data?: string | null;
  valor: number;
  situacao: string;
  emAberto?: boolean;
  fonte?: string;
};

export type VeiculoConsultaSecao<T> = {
  total: number;
  valorTotal: number;
  items: T[];
  error?: string;
  avisos?: string[];
};

export type VeiculoConsultaResultado = {
  placa: string;
  renavam?: string | null;
  ufRegistro?: string | null;
  veiculoCadastrado: boolean;
  fonte: VeiculoConsultaFonte;
  detranSc: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  detranRs: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  pedagio: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  estacionamento: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
};

function compactPlaca(placa: string): string {
  return placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function compactRenavam(renavam: string): string {
  return renavam.replace(/\D/g, "");
}

function findVeiculoByRenavam(renavam: string) {
  const norm = compactRenavam(renavam);
  if (!norm) return null;
  return (
    loadVeiculosDb().veiculos.find((v) => compactRenavam(v.renavam ?? "") === norm) ?? null
  );
}

function resolverIdentificadores(placaInput?: string, renavamInput?: string) {
  const placaNorm = compactPlaca(placaInput ?? "");
  const renavamNorm = compactRenavam(renavamInput ?? "");

  let veiculo =
    (placaNorm.length >= 7 ? findVeiculoByPlaca(placaInput!.trim()) : null) ??
    (renavamNorm.length >= 9 ? findVeiculoByRenavam(renavamInput!.trim()) : null);

  const placa =
    veiculo?.placa?.trim() ||
    (placaNorm.length >= 7 ? formatPlacaHyphen(placaInput!.trim()) : "");
  const renavam = veiculo?.renavam?.trim() || renavamNorm || "";

  if (!placa) {
    throw new HttpError(
      400,
      "Informe a placa (7 caracteres) ou um renavam cadastrado na frota.",
    );
  }

  return {
    placa,
    renavam,
    veiculo,
    ufRegistro:
      (typeof veiculo?.ufRegistro === "string" ? veiculo.ufRegistro.trim() : "") ||
      ufRegistroDaPlaca(placa) ||
      null,
  };
}

function multaEmAberto(m: DetranScMultaNormalizada): boolean {
  if (m.quitadaDetran) return false;
  const s = `${m.situacao} ${m.statusInfracao} ${m.statusDetran ?? ""}`.toLowerCase();
  return !/quitad|paga|justificad|advertid/.test(s);
}

function mapDetranScItem(m: DetranScMultaNormalizada): VeiculoConsultaPortalItem {
  return {
    id: m.numeroAuto || m.autoInfracao,
    ref: m.numeroAuto || m.autoInfracao,
    descricao: m.descricao?.trim() || "—",
    local: m.localInfracao?.trim() || null,
    data: m.dataAutuacao?.slice(0, 16) || null,
    valor: m.valorMulta ?? 0,
    situacao: m.situacao?.trim() || m.statusInfracao || "—",
    emAberto: multaEmAberto(m),
    fonte: m.fonte,
  };
}

function somaValor(items: VeiculoConsultaPortalItem[]): number {
  return Math.round(items.reduce((s, i) => s + (Number(i.valor) || 0), 0) * 100) / 100;
}

const FONTES_VALIDAS: VeiculoConsultaFonte[] = ["detran-sc", "detran-rs", "pedagio", "sigapay"];

export function parseVeiculoConsultaFonte(raw?: string): VeiculoConsultaFonte {
  const v = raw?.trim().toLowerCase();
  if (v && FONTES_VALIDAS.includes(v as VeiculoConsultaFonte)) {
    return v as VeiculoConsultaFonte;
  }
  return "detran-sc";
}

const emptySecao = (): VeiculoConsultaSecao<VeiculoConsultaPortalItem> => ({
  total: 0,
  valorTotal: 0,
  items: [],
});

async function consultarDetranSc(
  placa: string,
  renavam: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  if (!renavam) {
    return {
      ...emptySecao(),
      error:
        "DETRAN SC exige renavam — informe o renavam ou cadastre o veículo na frota.",
    };
  }

  const raw = await consultarVeiculoDetranSc(placa, renavam);
  const { cobraveis } = extrairMultasDetranSc(raw);
  const items = cobraveis.filter(multaEmAberto).map(mapDetranScItem);
  return { total: items.length, valorTotal: somaValor(items), items };
}

async function consultarDetranRs(
  placa: string,
  renavam: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  if (!renavam) {
    return {
      ...emptySecao(),
      error: "DETRAN RS exige renavam — informe o renavam ou cadastre o veículo na frota.",
    };
  }

  const raw = await consultarVeiculoDetranRs(placa, renavam);
  const resumo = extrairInfracoesResumoDetranRs(raw);
  const items: VeiculoConsultaPortalItem[] = [];
  if (resumo.qtVencidas > 0) {
    items.push({
      id: "rs-vencidas",
      ref: "RS",
      descricao: "Infrações vencidas (resumo DETRAN RS)",
      local: null,
      data: null,
      valor: 0,
      situacao: `${resumo.qtVencidas} vencida(s) · ${resumo.vlVencidas}`,
      emAberto: true,
      fonte: "detran-rs",
    });
  }
  if (resumo.qtAVencer > 0) {
    items.push({
      id: "rs-a-vencer",
      ref: "RS",
      descricao: "Infrações a vencer (resumo DETRAN RS)",
      local: null,
      data: null,
      valor: 0,
      situacao: `${resumo.qtAVencer} a vencer · ${resumo.vlAVencer}`,
      emAberto: true,
      fonte: "detran-rs",
    });
  }
  return {
    total: items.length,
    valorTotal: 0,
    items,
    avisos:
      resumo.total > 0
        ? ["DETRAN RS devolve totais agregados — detalhe por auto não disponível neste portal."]
        : undefined,
  };
}

async function consultarPedagio(
  placa: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  const r = await pedagioService.listarPassagensPlaca(placa, "aberto");
  const items = (r.items ?? []).map((p) => ({
    id: p.id,
    ref: p.id,
    descricao: "Passagem pedágio",
    local: [p.praca, p.rodovia].filter(Boolean).join(" · ") || null,
    data: p.dataHoraIso?.slice(0, 16) ?? p.dataHoraRaw?.slice(0, 16) ?? null,
    valor: Number(p.valor) || 0,
    situacao: p.emAberto ? "Em aberto" : "Pago",
    emAberto: p.emAberto,
    fonte: "pedagio-digital",
  }));
  return { total: items.length, valorTotal: somaValor(items), items };
}

async function consultarSigapay(
  placa: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  const r = await estacionamentoService.listarAvisosPlaca(placa, "aberto");
  const items = (r.items ?? []).map((a) => ({
    id: a.id,
    ref: a.id,
    descricao: a.local?.trim() || "Estacionamento rotativo",
    local: a.local ?? null,
    data: a.dataHoraIso?.slice(0, 16) ?? a.dataHoraRaw?.slice(0, 16) ?? null,
    valor: Number(a.valor) || 0,
    situacao: a.emAberto ? "Em aberto" : "Pago",
    emAberto: a.emAberto,
    fonte: "sigapay",
  }));
  return { total: items.length, valorTotal: somaValor(items), items };
}

function settledSecaoError(err: unknown): VeiculoConsultaSecao<VeiculoConsultaPortalItem> {
  return {
    ...emptySecao(),
    error: err instanceof Error ? err.message : String(err),
  };
}

async function runSecao(
  fn: () => Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>>,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  try {
    return await fn();
  } catch (err) {
    return settledSecaoError(err);
  }
}

export async function consultarVeiculoPortais(opts: {
  placa?: string;
  renavam?: string;
  fonte?: string;
}): Promise<VeiculoConsultaResultado> {
  const fonte = parseVeiculoConsultaFonte(opts.fonte);
  const ids = resolverIdentificadores(opts.placa, opts.renavam);

  let detranSc = emptySecao();
  let detranRs = emptySecao();
  let pedagio = emptySecao();
  let estacionamento = emptySecao();

  if (fonte === "detran-sc") {
    detranSc = await runSecao(() => consultarDetranSc(ids.placa, ids.renavam));
  } else if (fonte === "detran-rs") {
    detranRs = await runSecao(() => consultarDetranRs(ids.placa, ids.renavam));
  } else if (fonte === "pedagio") {
    pedagio = await runSecao(() => consultarPedagio(ids.placa));
  } else if (fonte === "sigapay") {
    estacionamento = await runSecao(() => consultarSigapay(ids.placa));
  }

  return {
    placa: ids.placa,
    renavam: ids.renavam || null,
    ufRegistro: ids.ufRegistro,
    veiculoCadastrado: Boolean(ids.veiculo),
    fonte,
    detranSc,
    detranRs,
    pedagio,
    estacionamento,
  };
}
