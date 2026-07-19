/**
 * Orquestra: ACT/avisos em aberto no SigaPay → cliente-despesas.json
 * (categoria "Estacionamento"), com inferência e confirmação
 * de responsável igual a pedágios e infrações.
 */
import fs from "node:fs";
import path from "node:path";

import {
  sincronizarClienteDespesa,
  type SincronizarClienteDespesaResult,
} from "../clienteDespesasDb.js";
import { CATEGORIA_ESTACIONAMENTO, normalizarCategoriaEstacionamentoNoDb } from "../estacionamentoCategoria.js";
import { compactPlaca, formatPlacaHyphen } from "../placa.js";
import { REPO_ROOT } from "../repoRoot.js";
import { loadPlacasParaSync } from "../pedagioDigital/syncPedagios.js";
import { SigapayAuthError } from "./client.js";
import {
  extrairAvisos,
  filtrarStatusAviso,
  listarAvisos,
  listarAvisosLote,
  type AvisoEstacionamento,
} from "./avisos.js";

export type SyncEstacionamentoResult = {
  placa: string;
  novos: number;
  atualizados: number;
  semAlteracao: number;
  ignorados: number;
  avisos: string[];
};

const fmtSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatarDataHoraBr(a: AvisoEstacionamento): string | null {
  const raw = a.dataHoraRaw.trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
  if (a.dataHoraIso) {
    const parts = fmtSP.formatToParts(new Date(a.dataHoraIso));
    const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
  }
  return null;
}

/** Título/cobrança do ACT SigaPay. */
export function descricaoEstacionamento(dataHoraBr: string, emAberto = true): string {
  const base = `Estacionamento rotativo ${dataHoraBr}`;
  return emAberto ? `ATRASADO ${base}` : base;
}

async function aplicarAviso(
  placa: string,
  a: AvisoEstacionamento,
  dryRun: boolean,
): Promise<{ result: SincronizarClienteDespesaResult | null; aviso: string | null }> {
  const dataHoraBr = formatarDataHoraBr(a);
  if (!dataHoraBr) {
    return { result: null, aviso: `aviso ${a.id}: data inválida (${a.dataHoraRaw})` };
  }

  const autoInfracao = `EST-${a.id}`;
  const descricao = descricaoEstacionamento(dataHoraBr, true);

  if (dryRun) {
    return {
      result: {
        registro: {
          id: "(dry-run)",
          categoria: CATEGORIA_ESTACIONAMENTO,
          veiculoId: formatPlacaHyphen(placa),
          autoInfracao,
          descricao,
          localInfracao: a.local ?? "",
          dataAutuacao: dataHoraBr,
          valorMulta: a.valor,
          situacao: "Em aberto",
          limiteDefesa: "",
          condutorId: null,
          condutorConfirmado: false,
          condutorContrato: null,
          rastreameTipo: "PEDAGIO",
          cadastradoEm: "",
          atualizadoEm: "",
          origem: "sigapay",
        },
        acao: "novo",
        aviso: null,
      },
      aviso: null,
    };
  }

  const r = await sincronizarClienteDespesa(placa, {
    autoInfracao,
    descricao,
    localInfracao: a.local ?? "",
    dataAutuacao: dataHoraBr,
    valorMulta: a.valor,
    situacao: "Em aberto",
    limiteDefesa: "",
    categoria: CATEGORIA_ESTACIONAMENTO,
    origem: "sigapay",
    rastreameTipo: "PEDAGIO",
  });
  return { result: r, aviso: r.aviso };
}

export async function processarAvisos(
  placa: string,
  avisos: AvisoEstacionamento[],
  opts?: { dryRun?: boolean },
): Promise<SyncEstacionamentoResult> {
  const result: SyncEstacionamentoResult = {
    placa: formatPlacaHyphen(placa),
    novos: 0,
    atualizados: 0,
    semAlteracao: 0,
    ignorados: 0,
    avisos: [],
  };

  for (const a of filtrarStatusAviso(avisos, "aberto")) {
    const { result: r, aviso } = await aplicarAviso(placa, a, opts?.dryRun === true);
    if (!r) {
      result.ignorados++;
      if (aviso) result.avisos.push(aviso);
      continue;
    }
    if (r.acao === "novo") result.novos++;
    else if (r.acao === "atualizado") result.atualizados++;
    else result.semAlteracao++;
    if (aviso) result.avisos.push(`${r.registro.autoInfracao}: ${aviso}`);
  }

  return result;
}

function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function loadAliasesPlaca(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    const p = path.join(REPO_ROOT, "database", "veiculos.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
      veiculos?: { placa?: string; placaAntiga?: string; ativo?: boolean }[];
    };
    for (const v of j.veiculos ?? []) {
      if (v.ativo === false || !v.placa || !v.placaAntiga) continue;
      m.set(compactPlaca(v.placaAntiga), compactPlaca(v.placa));
    }
  } catch {
    // sem aliases
  }
  return m;
}

function resolverPlacaFrota(
  lida: string,
  frotaCompact: string[],
  aliases: Map<string, string>,
): string {
  if (frotaCompact.includes(lida)) return lida;
  const alias = aliases.get(lida);
  if (alias) return alias;
  const candidatos = frotaCompact.filter((p) => hamming(p, lida) === 1);
  return candidatos.length === 1 ? candidatos[0]! : lida;
}

function agruparPorPlaca(
  avisos: AvisoEstacionamento[],
  frota?: string[],
): Map<string, AvisoEstacionamento[]> {
  const frotaCompact = (frota ?? []).map(compactPlaca).filter(Boolean);
  const aliases = frotaCompact.length ? loadAliasesPlaca() : new Map<string, string>();
  const m = new Map<string, AvisoEstacionamento[]>();
  for (const a of avisos) {
    const lida = compactPlaca(a.placa);
    if (!lida) continue;
    const k = frotaCompact.length ? resolverPlacaFrota(lida, frotaCompact, aliases) : lida;
    const arr = m.get(k);
    if (arr) arr.push(a);
    else m.set(k, [a]);
  }
  return m;
}

export async function processarAvisosJson(
  placa: string,
  jsonPath: string,
  opts?: { dryRun?: boolean },
): Promise<SyncEstacionamentoResult> {
  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonPath), "utf8"));
  const alvo = compactPlaca(placa);
  const avisos = extrairAvisos(raw).filter((a) => compactPlaca(a.placa) === alvo);
  return processarAvisos(placa, avisos, opts);
}

export async function processarAvisosJsonLote(
  jsonPath: string,
  opts?: { dryRun?: boolean; placa?: string },
): Promise<SyncEstacionamentoResult[]> {
  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonPath), "utf8"));
  const placas = loadPlacasParaSync(opts?.placa);
  const porPlaca = agruparPorPlaca(extrairAvisos(raw), placas);
  return Promise.all(
    placas.map((placa) =>
      processarAvisos(placa, porPlaca.get(compactPlaca(placa)) ?? [], {
        dryRun: opts?.dryRun,
      }),
    ),
  );
}

export async function sincronizarEstacionamentoVeiculo(
  placa: string,
  opts?: { dryRun?: boolean },
): Promise<SyncEstacionamentoResult> {
  const avisos = await listarAvisos(placa, { status: "aberto" });
  return processarAvisos(placa, avisos, opts);
}

export async function sincronizarEstacionamentoFrota(opts?: {
  placa?: string;
  dryRun?: boolean;
}): Promise<SyncEstacionamentoResult[]> {
  if (!opts?.dryRun) normalizarCategoriaEstacionamentoNoDb();

  const placas = loadPlacasParaSync(opts?.placa);
  if (placas.length === 0) return [];

  let porPlaca: Map<string, AvisoEstacionamento[]>;
  try {
    porPlaca = agruparPorPlaca(
      await listarAvisosLote(placas, { status: "aberto" }),
      placas,
    );
  } catch (e) {
    if (e instanceof SigapayAuthError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return placas.map((placa) => ({
      placa: formatPlacaHyphen(placa),
      novos: 0,
      atualizados: 0,
      semAlteracao: 0,
      ignorados: 0,
      avisos: [msg],
    }));
  }

  return Promise.all(
    placas.map((placa) =>
      processarAvisos(placa, porPlaca.get(compactPlaca(placa)) ?? [], {
        dryRun: opts?.dryRun,
      }),
    ),
  );
}

export { loadPlacasParaSync };
