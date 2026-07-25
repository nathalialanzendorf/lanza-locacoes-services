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
  detran: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
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
    ufRegistro: veiculo?.ufRegistro?.trim() || ufRegistroDaPlaca(placa) || null,
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

async function consultarDetran(
  placa: string,
  renavam: string,
  ufRegistro: string | null,
  status: "aberto" | "todos",
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  const uf = (ufRegistro ?? "").toUpperCase();
  if (uf === "RS") {
    if (!renavam) {
      return {
        total: 0,
        valorTotal: 0,
        items: [],
        error: "DETRAN RS exige renavam — informe o renavam ou cadastre o veículo na frota.",
      };
    }
    const raw = await consultarVeiculoDetranRs(placa, renavam);
    const resumo = extrairInfracoesResumoDetranRs(raw);
    const items: VeiculoConsultaPortalItem[] = [];
    if (status === "todos" || resumo.qtVencidas > 0 || resumo.qtAVencer > 0) {
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
      if (status === "todos" && resumo.qtSuspensas > 0) {
        items.push({
          id: "rs-suspensas",
          ref: "RS",
          descricao: "Infrações suspensas (resumo DETRAN RS)",
          local: null,
          data: null,
          valor: 0,
          situacao: `${resumo.qtSuspensas} suspensa(s)`,
          emAberto: false,
          fonte: "detran-rs",
        });
      }
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

  if (!renavam) {
    return {
      total: 0,
      valorTotal: 0,
      items: [],
      error:
        "DETRAN SC exige renavam — informe o renavam ou cadastre o veículo na frota.",
    };
  }

  const raw = await consultarVeiculoDetranSc(placa, renavam);
  const { cobraveis, historico } = extrairMultasDetranSc(raw);
  const fonte = status === "todos" ? [...cobraveis, ...historico] : cobraveis;
  const items = fonte
    .filter((m) => (status === "todos" ? true : multaEmAberto(m)))
    .map(mapDetranScItem);
  return { total: items.length, valorTotal: somaValor(items), items };
}

export async function consultarVeiculoPortais(opts: {
  placa?: string;
  renavam?: string;
  status?: "aberto" | "todos";
}): Promise<VeiculoConsultaResultado> {
  const status = opts.status === "todos" ? "todos" : "aberto";
  const ids = resolverIdentificadores(opts.placa, opts.renavam);
  const portalStatus = status === "aberto" ? "aberto" : "todos";

  const [detranSettled, pedagioSettled, estacionamentoSettled] = await Promise.allSettled([
    consultarDetran(ids.placa, ids.renavam, ids.ufRegistro, status),
    pedagioService.listarPassagensPlaca(ids.placa, portalStatus),
    estacionamentoService.listarAvisosPlaca(ids.placa, portalStatus),
  ]);

  const empty: VeiculoConsultaSecao<VeiculoConsultaPortalItem> = {
    total: 0,
    valorTotal: 0,
    items: [],
  };

  let detran = empty;
  if (detranSettled.status === "fulfilled") {
    detran = detranSettled.value;
  } else {
    detran = {
      ...empty,
      error:
        detranSettled.reason instanceof Error
          ? detranSettled.reason.message
          : String(detranSettled.reason),
    };
  }

  let pedagio = empty;
  if (pedagioSettled.status === "fulfilled") {
    const r = pedagioSettled.value;
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
    pedagio = { total: items.length, valorTotal: somaValor(items), items };
  } else {
    pedagio = {
      ...empty,
      error:
        pedagioSettled.reason instanceof Error
          ? pedagioSettled.reason.message
          : String(pedagioSettled.reason),
    };
  }

  let estacionamento = empty;
  if (estacionamentoSettled.status === "fulfilled") {
    const r = estacionamentoSettled.value;
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
    estacionamento = { total: items.length, valorTotal: somaValor(items), items };
  } else {
    estacionamento = {
      ...empty,
      error:
        estacionamentoSettled.reason instanceof Error
          ? estacionamentoSettled.reason.message
          : String(estacionamentoSettled.reason),
    };
  }

  return {
    placa: ids.placa,
    renavam: ids.renavam || null,
    ufRegistro: ids.ufRegistro,
    veiculoCadastrado: Boolean(ids.veiculo),
    detran,
    pedagio,
    estacionamento,
  };
}
