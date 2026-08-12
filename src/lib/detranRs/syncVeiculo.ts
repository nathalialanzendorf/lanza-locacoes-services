import { sincronizarParceiroDespesaAsync } from "../parceiroDespesasDb.js";
import { compactPlaca, formatPlacaHyphen } from "../placa.js";
import {
  acaoParaStatusSync,
  type SyncAlteracaoLinha,
} from "../sync/syncAlteracoes.js";
import { loadVeiculosDb, loadVeiculosDbAsync } from "../veiculosDb.js";
import { consultarVeiculoDetranRs, type DetranRsConsultaVeiculo } from "./consulta.js";
import {
  extrairDespesasDetranRs,
  extrairInfracoesResumoDetranRs,
} from "./mapDebitos.js";

export type VeiculoFrotaRs = { placa: string; renavam: string };

export type SyncDetranRsResult = {
  placa: string;
  novos: number;
  atualizados: number;
  semAlteracao: number;
  ignorados: number;
  infracoesResumo: number;
  avisos: string[];
  alteracoes: SyncAlteracaoLinha[];
};

/** Veículos ATIVOS registrados no RS (ufRegistro === "RS"). */
async function loadVeiculosFrotaRsAsync(placaFiltro?: string): Promise<VeiculoFrotaRs[]> {
  const db = await loadVeiculosDbAsync({ ativo: true, placa: placaFiltro });
  const filtro = placaFiltro ? compactPlaca(placaFiltro) : null;

  return db.veiculos
    .filter((v) => String(v.ufRegistro ?? "").toUpperCase() === "RS")
    .filter((v) => v.placa && v.renavam)
    .filter((v) => !filtro || compactPlaca(v.placa) === filtro)
    .map((v) => ({ placa: v.placa, renavam: String(v.renavam) }));
}

export function loadVeiculosFrotaRs(placaFiltro?: string): VeiculoFrotaRs[] {
  const j = loadVeiculosDb();
  const filtro = placaFiltro ? compactPlaca(placaFiltro) : null;

  return j.veiculos
    .filter((v) => v.ativo !== false)
    .filter((v) => String(v.ufRegistro ?? "").toUpperCase() === "RS")
    .filter((v) => v.placa && v.renavam)
    .filter((v) => !filtro || compactPlaca(v.placa) === filtro)
    .map((v) => ({ placa: v.placa, renavam: String(v.renavam) }));
}

export async function loadVeiculosRsParaSyncAsync(
  placaFiltro?: string,
): Promise<VeiculoFrotaRs[]> {
  const list = await loadVeiculosFrotaRsAsync(placaFiltro);
  if (placaFiltro && list.length === 0) {
    throw new Error(`Placa RS não encontrada (ufRegistro="RS"): ${placaFiltro}`);
  }
  return list;
}

export function loadVeiculosRsParaSync(placaFiltro?: string): VeiculoFrotaRs[] {
  const list = loadVeiculosFrotaRs(placaFiltro);
  if (placaFiltro && list.length === 0) {
    throw new Error(
      `Placa RS não encontrada (ufRegistro="RS") em veiculos.json: ${placaFiltro}`,
    );
  }
  return list;
}

export async function processarRespostaDetranRs(
  placa: string,
  raw: DetranRsConsultaVeiculo,
  opts?: { dryRun?: boolean },
): Promise<SyncDetranRsResult> {
  const dryRun = opts?.dryRun === true;
  const { despesas, ignorados } = extrairDespesasDetranRs(placa, raw);
  const resumo = extrairInfracoesResumoDetranRs(raw);

  const result: SyncDetranRsResult = {
    placa: formatPlacaHyphen(placa),
    novos: 0,
    atualizados: 0,
    semAlteracao: 0,
    ignorados,
    infracoesResumo: resumo.total,
    avisos: [],
    alteracoes: [],
  };

  for (const d of despesas) {
    const r = await sincronizarParceiroDespesaAsync(
      {
        placa,
        categoria: d.categoria,
        descricao: d.descricao,
        data: d.data,
        valor: d.valor,
        competencia: d.competencia,
        origem: d.origem,
      },
      { dryRun },
    );
    if (r.acao === "novo") result.novos++;
    else if (r.acao === "atualizado") result.atualizados++;
    else result.semAlteracao++;
    if (r.aviso) result.avisos.push(`${d.categoria} ${d.exercicio || d.data}: ${r.aviso}`);
    result.alteracoes.push({
      placa: formatPlacaHyphen(placa),
      entidade: "detran_rs",
      referencia: d.origem || `${d.categoria}-${d.exercicio || d.data}`,
      descricao: d.descricao,
      valor: d.valor,
      data: d.data || null,
      status: acaoParaStatusSync(r.acao),
      aviso: r.aviso,
    });
  }

  // O endpoint do RS só devolve totais de infração (sem detalhe por multa).
  if (resumo.total > 0) {
    result.avisos.push(
      `Infrações (resumo RS): ${resumo.qtVencidas} vencida(s) ${resumo.vlVencidas}, ` +
        `${resumo.qtAVencer} a vencer ${resumo.vlAVencer} — detalhe por multa não disponível neste endpoint (rever manualmente).`,
    );
  }

  return result;
}

export async function sincronizarVeiculoDetranRs(
  placa: string,
  renavam: string,
  opts?: { dryRun?: boolean },
): Promise<SyncDetranRsResult> {
  const raw = await consultarVeiculoDetranRs(placa, renavam);
  return await processarRespostaDetranRs(placa, raw, opts);
}

export async function sincronizarFrotaDetranRs(opts?: {
  placa?: string;
  dryRun?: boolean;
  delayMs?: number;
}): Promise<SyncDetranRsResult[]> {
  const veiculos = await loadVeiculosRsParaSyncAsync(opts?.placa);
  const out: SyncDetranRsResult[] = [];
  const delay = opts?.delayMs ?? 1500;

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]!;
    try {
      out.push(await sincronizarVeiculoDetranRs(v.placa, v.renavam, { dryRun: opts?.dryRun }));
    } catch (e) {
      out.push({
        placa: formatPlacaHyphen(v.placa),
        novos: 0,
        atualizados: 0,
        semAlteracao: 0,
        ignorados: 0,
        infracoesResumo: 0,
        avisos: [e instanceof Error ? e.message : String(e)],
        alteracoes: [],
      });
    }
    if (i < veiculos.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return out;
}
