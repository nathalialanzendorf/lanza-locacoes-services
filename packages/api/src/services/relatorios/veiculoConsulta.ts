import {
  findVeiculoByPlaca,
  formatPlacaHyphen,
  loadVeiculosDb,
  loadVeiculosParaSync,
  loadVeiculosRsParaSync,
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

export type VeiculoConsultaFonte = "detran-sc" | "detran-rs" | "pedagio" | "sigapay" | "todos";

export type VeiculoConsultaPortalItem = {
  id: string;
  ref?: string;
  placa?: string;
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
  modo: "veiculo" | "frota";
  placa: string;
  renavam?: string | null;
  ufRegistro?: string | null;
  veiculoCadastrado: boolean;
  veiculosConsultados?: number;
  fonte: VeiculoConsultaFonte;
  detranSc: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  detranRs: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  pedagio: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  estacionamento: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
};

const DETRAN_FROTA_DELAY_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const FONTES_VALIDAS: VeiculoConsultaFonte[] = [
  "detran-sc",
  "detran-rs",
  "pedagio",
  "sigapay",
  "todos",
];

function isConsultaTodos(raw?: string): boolean {
  const v = raw?.trim().toLowerCase();
  return !v || v === "todos" || v === "all";
}

export function parseVeiculoConsultaFonte(raw?: string): VeiculoConsultaFonte {
  if (isConsultaTodos(raw)) return "todos";
  const v = raw?.trim().toLowerCase();
  if (v && FONTES_VALIDAS.includes(v as VeiculoConsultaFonte)) {
    return v as VeiculoConsultaFonte;
  }
  return "todos";
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

function mapPedagioItem(p: {
  id: string;
  placa?: string;
  dataHoraIso?: string | null;
  dataHoraRaw?: string;
  valor?: number;
  praca?: string | null;
  rodovia?: string | null;
  emAberto?: boolean;
}): VeiculoConsultaPortalItem {
  return {
    id: p.placa ? `${p.placa}-${p.id}` : p.id,
    ref: p.id,
    placa: p.placa,
    descricao: "Passagem pedágio",
    local: [p.praca, p.rodovia].filter(Boolean).join(" · ") || null,
    data: p.dataHoraIso?.slice(0, 16) ?? p.dataHoraRaw?.slice(0, 16) ?? null,
    valor: Number(p.valor) || 0,
    situacao: p.emAberto ? "Em aberto" : "Pago",
    emAberto: p.emAberto,
    fonte: "pedagio-digital",
  };
}

function mapSigapayItem(a: {
  id: string;
  placa?: string;
  dataHoraIso?: string | null;
  dataHoraRaw?: string;
  valor?: number;
  local?: string | null;
  emAberto?: boolean;
}): VeiculoConsultaPortalItem {
  return {
    id: a.placa ? `${a.placa}-${a.id}` : a.id,
    ref: a.id,
    placa: a.placa,
    descricao: a.local?.trim() || "Estacionamento rotativo",
    local: a.local ?? null,
    data: a.dataHoraIso?.slice(0, 16) ?? a.dataHoraRaw?.slice(0, 16) ?? null,
    valor: Number(a.valor) || 0,
    situacao: a.emAberto ? "Em aberto" : "Pago",
    emAberto: a.emAberto,
    fonte: "sigapay",
  };
}

async function consultarPedagio(
  placa: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  const r = await pedagioService.listarPassagensPlaca(placa, "aberto");
  const items = (r.items ?? []).map((p) => mapPedagioItem({ ...p, placa: r.placa }));
  return { total: items.length, valorTotal: somaValor(items), items };
}

async function consultarPedagioFrota(): Promise<{
  secao: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  veiculosConsultados: number;
}> {
  const r = await pedagioService.listarPassagensFrota("aberto");
  const items = (r.items ?? []).map(mapPedagioItem);
  return {
    veiculosConsultados: r.placas?.length ?? 0,
    secao: { total: items.length, valorTotal: somaValor(items), items },
  };
}

async function consultarSigapay(
  placa: string,
): Promise<VeiculoConsultaSecao<VeiculoConsultaPortalItem>> {
  const r = await estacionamentoService.listarAvisosPlaca(placa, "aberto");
  const items = (r.items ?? []).map((a) => mapSigapayItem({ ...a, placa: r.placa }));
  return { total: items.length, valorTotal: somaValor(items), items };
}

async function consultarSigapayFrota(): Promise<{
  secao: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  veiculosConsultados: number;
}> {
  const r = await estacionamentoService.listarAvisosFrota("aberto");
  const items = (r.items ?? []).map(mapSigapayItem);
  return {
    veiculosConsultados: r.placas?.length ?? 0,
    secao: { total: items.length, valorTotal: somaValor(items), items },
  };
}

async function consultarDetranScFrota(): Promise<{
  secao: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  veiculosConsultados: number;
}> {
  const veiculos = loadVeiculosParaSync().filter((v) => v.renavam?.trim());
  if (!veiculos.length) {
    return {
      veiculosConsultados: 0,
      secao: { ...emptySecao(), avisos: ["Nenhum veículo SC activo com renavam na frota."] },
    };
  }

  const items: VeiculoConsultaPortalItem[] = [];
  const avisos: string[] = [];
  let falhas = 0;

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]!;
    const placa = formatPlacaHyphen(v.placa);
    const sec = await runSecao(() => consultarDetranSc(placa, v.renavam!.trim()));
    if (sec.error) {
      falhas++;
      avisos.push(`${placa}: ${sec.error}`);
    } else {
      for (const item of sec.items) {
        items.push({
          ...item,
          id: `${placa}-${item.id}`,
          placa,
        });
      }
    }
    if (i < veiculos.length - 1) await sleep(DETRAN_FROTA_DELAY_MS);
  }

  if (falhas > 0) {
    avisos.unshift(`${falhas} veículo(s) com erro na consulta DETRAN SC.`);
  }

  return {
    veiculosConsultados: veiculos.length,
    secao: {
      total: items.length,
      valorTotal: somaValor(items),
      items,
      avisos: avisos.length ? avisos : undefined,
    },
  };
}

async function consultarDetranRsFrota(): Promise<{
  secao: VeiculoConsultaSecao<VeiculoConsultaPortalItem>;
  veiculosConsultados: number;
}> {
  const veiculos = loadVeiculosRsParaSync().filter((v) => v.renavam?.trim());
  if (!veiculos.length) {
    return {
      veiculosConsultados: 0,
      secao: { ...emptySecao(), avisos: ["Nenhum veículo RS activo com renavam na frota."] },
    };
  }

  const items: VeiculoConsultaPortalItem[] = [];
  const avisos: string[] = [];
  let falhas = 0;

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]!;
    const placa = formatPlacaHyphen(v.placa);
    const sec = await runSecao(() => consultarDetranRs(placa, v.renavam!.trim()));
    if (sec.error) {
      falhas++;
      avisos.push(`${placa}: ${sec.error}`);
    } else {
      for (const item of sec.items) {
        items.push({
          ...item,
          id: `${placa}-${item.id}`,
          placa,
        });
      }
      if (sec.avisos?.length) avisos.push(...sec.avisos.map((a) => `${placa}: ${a}`));
    }
    if (i < veiculos.length - 1) await sleep(DETRAN_FROTA_DELAY_MS);
  }

  if (falhas > 0) {
    avisos.unshift(`${falhas} veículo(s) com erro na consulta DETRAN RS.`);
  }

  return {
    veiculosConsultados: veiculos.length,
    secao: {
      total: items.length,
      valorTotal: somaValor(items),
      items,
      avisos: avisos.length ? avisos : undefined,
    },
  };
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
  const placaNorm = compactPlaca(opts.placa ?? "");
  const renavamNorm = compactRenavam(opts.renavam ?? "");
  const frota = !placaNorm && !renavamNorm;

  let detranSc = emptySecao();
  let detranRs = emptySecao();
  let pedagio = emptySecao();
  let estacionamento = emptySecao();
  let veiculosConsultados = 0;
  let placa = "Frota activa";
  let renavam: string | null = null;
  let ufRegistro: string | null = null;
  let veiculoCadastrado = true;

  if (frota) {
    const consultarTodos = fonte === "todos";
    if (consultarTodos) {
      const [rSc, rRs, rPed, rSig] = await Promise.all([
        consultarDetranScFrota(),
        consultarDetranRsFrota(),
        consultarPedagioFrota().catch((err) => ({
          secao: settledSecaoError(err),
          veiculosConsultados: 0,
        })),
        consultarSigapayFrota().catch((err) => ({
          secao: settledSecaoError(err),
          veiculosConsultados: 0,
        })),
      ]);
      detranSc = rSc.secao;
      detranRs = rRs.secao;
      pedagio = rPed.secao;
      estacionamento = rSig.secao;
      veiculosConsultados = Math.max(
        rSc.veiculosConsultados,
        rRs.veiculosConsultados,
        rPed.veiculosConsultados,
        rSig.veiculosConsultados,
      );
    } else {
      if (fonte === "detran-sc") {
        const r = await consultarDetranScFrota();
        detranSc = r.secao;
        veiculosConsultados = r.veiculosConsultados;
      } else if (fonte === "detran-rs") {
        const r = await consultarDetranRsFrota();
        detranRs = r.secao;
        veiculosConsultados = r.veiculosConsultados;
      } else if (fonte === "pedagio") {
        try {
          const r = await consultarPedagioFrota();
          pedagio = r.secao;
          veiculosConsultados = r.veiculosConsultados;
        } catch (err) {
          pedagio = settledSecaoError(err);
        }
      } else if (fonte === "sigapay") {
        try {
          const r = await consultarSigapayFrota();
          estacionamento = r.secao;
          veiculosConsultados = r.veiculosConsultados;
        } catch (err) {
          estacionamento = settledSecaoError(err);
        }
      }
    }
  } else {
    const ids = resolverIdentificadores(opts.placa, opts.renavam);
    placa = ids.placa;
    renavam = ids.renavam || null;
    ufRegistro = ids.ufRegistro;
    veiculoCadastrado = Boolean(ids.veiculo);
    veiculosConsultados = 1;

    const consultarTodos = fonte === "todos";
    if (consultarTodos) {
      [detranSc, detranRs, pedagio, estacionamento] = await Promise.all([
        runSecao(() => consultarDetranSc(ids.placa, ids.renavam)),
        runSecao(() => consultarDetranRs(ids.placa, ids.renavam)),
        runSecao(() => consultarPedagio(ids.placa)),
        runSecao(() => consultarSigapay(ids.placa)),
      ]);
    } else {
      if (fonte === "detran-sc") {
        detranSc = await runSecao(() => consultarDetranSc(ids.placa, ids.renavam));
      } else if (fonte === "detran-rs") {
        detranRs = await runSecao(() => consultarDetranRs(ids.placa, ids.renavam));
      } else if (fonte === "pedagio") {
        pedagio = await runSecao(() => consultarPedagio(ids.placa));
      } else if (fonte === "sigapay") {
        estacionamento = await runSecao(() => consultarSigapay(ids.placa));
      }
    }
  }

  return {
    modo: frota ? "frota" : "veiculo",
    placa,
    renavam,
    ufRegistro,
    veiculoCadastrado,
    veiculosConsultados,
    fonte,
    detranSc,
    detranRs,
    pedagio,
    estacionamento,
  };
}
