import fs from "node:fs";
import path from "node:path";

import {
  auditarInfracoesSemCondutor,
  defaultSeguroComprovantesDirs,
  ensureRelatoriosDirs,
  extrairSeguroComprovantesDirs,
  loadPlacasParaSync,
  loadVeiculosParaSync,
  loadVeiculosRsParaSync,
  normalizarTitulosPedagioNoDb,
  processarDespesasDetranSc,
  processarPassagensJson,
  processarPassagensJsonLote,
  processarAvisosJson,
  processarAvisosJsonLote,
  loadPlacasParaSyncEstacionamento,
  processarRespostaDetranRs,
  processarRespostaDetranSc,
  pushManutencoesToRastreame,
  pushRecebimentosToRastreame,
  RELATORIOS_SYNC_DIR,
  sincronizarDespesasFrotaDetranSc,
  sincronizarDespesasPorTicketDetranSc,
  sincronizarDespesasVeiculoDetranSc,
  sincronizarFrotaDetranRs,
  sincronizarMultasFrotaDetranSc,
  sincronizarMultasPorTicketDetranSc,
  sincronizarMultasVeiculoDetranSc,
  sincronizarParceiroDespesa,
  sincronizarPedagiosFrota,
  sincronizarPedagiosVeiculo,
  sincronizarEstacionamentoFrota,
  sincronizarEstacionamentoVeiculo,
  sincronizarVeiculoDetranRs,
  syncMotoristas,
  syncRastreaveis,
  preencherFipeFaltante,
  syncRecebimentos,
  ufRegistroDaPlaca,
  type DetranRsConsultaVeiculo,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";
import * as fipeService from "../fipe.js";
import { normalizarSyncId, syncDirecaoDefaults, SYNC_COMPLETO_ORDEM, type SyncId } from "./catalog.js";

export type SyncBaseOpts = {
  dryRun?: boolean;
  placa?: string;
};

export type SyncRastreameOpts = SyncBaseOpts & {
  pullOnly?: boolean;
  pushOnly?: boolean;
  forcePull?: boolean;
  forcePush?: boolean;
};

export type SyncRecebimentosOpts = SyncRastreameOpts & {
  motoristaKey?: string;
};

export type SyncRastreaveisOpts = SyncRastreameOpts;

export type SyncFipeOpts = SyncBaseOpts & {
  /** Só veículos ativos sem FIPE (default API: frota ativa completa). */
  faltantes?: boolean;
};

export type SyncDetranScOpts = SyncBaseOpts & {
  ticket?: string;
  captcha?: string;
  jsonPath?: string;
  prazoDias?: number;
  delayMs?: number;
  noRs?: boolean;
};

export type SyncPedagiosOpts = SyncBaseOpts & {
  jsonPath?: string;
  normalizarTitulos?: boolean;
};

export type SyncEstacionamentoOpts = SyncBaseOpts & {
  jsonPath?: string;
};

export type SyncSeguroOpts = {
  anos?: string[];
  boletosPath?: string;
  jsonOnly?: boolean;
};

export type SyncManutencaoOpts = SyncBaseOpts & {
  categoria?: string;
};

export type SyncInput = SyncBaseOpts &
  SyncRastreameOpts &
  SyncRecebimentosOpts &
  SyncRastreaveisOpts &
  SyncFipeOpts &
  SyncDetranScOpts &
  SyncPedagiosOpts &
  SyncEstacionamentoOpts &
  SyncSeguroOpts &
  SyncManutencaoOpts;

function aplicarDirecaoSync(sync: SyncId, input: SyncInput): SyncInput {
  const d = syncDirecaoDefaults(sync);
  // Syncs Rastreame de envio: sempre push-only, mesmo se o cliente pedir pull.
  if (d.pushOnly && !d.pullOnly) {
    return { ...input, pullOnly: false, pushOnly: true };
  }
  if (input.pullOnly === true || input.pushOnly === true) return input;
  return { ...input, ...d };
}

function readJsonFile(jsonPath: string): unknown {
  const p = path.resolve(jsonPath);
  if (!fs.existsSync(p)) {
    throw new HttpError(400, `JSON não encontrado: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function resumoLista<T extends { novos?: number; atualizados?: number }>(
  items: T[],
): { total: number; novos: number; atualizados: number; items: T[] } {
  let novos = 0;
  let atualizados = 0;
  for (const r of items) {
    novos += r.novos ?? 0;
    atualizados += r.atualizados ?? 0;
  }
  return { total: items.length, novos, atualizados, items };
}

async function runMotoristas(opts: SyncRastreameOpts) {
  const r = await syncMotoristas({
    dryRun: opts.dryRun,
    pull: !opts.pushOnly,
    push: !opts.pullOnly,
    forcePull: opts.forcePull,
    forcePush: opts.forcePush,
  });
  return { push: r.push, pull: r.pull };
}

async function runRastreaveis(opts: SyncRastreaveisOpts) {
  const r = await syncRastreaveis({
    dryRun: opts.dryRun,
    pull: !opts.pushOnly,
    push: !opts.pullOnly,
    forcePull: opts.forcePull,
    fipe: false,
  });
  return { push: r.push, pull: r.pull };
}

async function runFipe(opts: SyncFipeOpts) {
  if (opts.placa?.trim()) {
    return fipeService.atualizarFipeVeiculo(opts.placa.trim());
  }
  if (opts.faltantes) {
    return preencherFipeFaltante({ dryRun: opts.dryRun });
  }
  return fipeService.atualizarFipeFrota();
}

async function runRecebimentos(opts: SyncRecebimentosOpts) {
  const r = await syncRecebimentos({
    dryRun: opts.dryRun,
    pull: !opts.pushOnly,
    push: !opts.pullOnly,
    forcePull: opts.forcePull,
    motoristaKey: opts.motoristaKey,
  });
  return { push: r.push, pull: r.pull };
}

async function runPedagios(opts: SyncPedagiosOpts) {
  if (opts.normalizarTitulos) {
    const r = normalizarTitulosPedagioNoDb({ dryRun: opts.dryRun });
    let push = null;
    if (!opts.dryRun && r.atualizados > 0) {
      push = await pushRecebimentosToRastreame({});
    }
    return { modo: "normalizar-titulos", normalizar: r, push };
  }

  if (opts.jsonPath && opts.placa) {
    loadPlacasParaSync(opts.placa);
    const r = await processarPassagensJson(opts.placa, opts.jsonPath, {
      dryRun: opts.dryRun,
    });
    return { modo: "json-placa", resultado: r };
  }

  if (opts.placa) {
    loadPlacasParaSync(opts.placa);
    const r = await sincronizarPedagiosVeiculo(opts.placa, { dryRun: opts.dryRun });
    return { modo: "placa", resultado: r };
  }

  const results = opts.jsonPath
    ? await processarPassagensJsonLote(opts.jsonPath, { dryRun: opts.dryRun })
    : await sincronizarPedagiosFrota({ dryRun: opts.dryRun });

  const resumo = resumoLista(results);
  let push = null;
  let relatorioPath: string | null = null;

  if (!opts.dryRun) {
    ensureRelatoriosDirs();
    relatorioPath = path.join(RELATORIOS_SYNC_DIR, "_sync_pedagios.json");
    fs.mkdirSync(path.dirname(relatorioPath), { recursive: true });
    fs.writeFileSync(
      relatorioPath,
      JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
      "utf8",
    );
    push = await pushRecebimentosToRastreame({});
  }

  return { modo: opts.jsonPath ? "json-lote" : "frota", ...resumo, push, relatorioPath };
}

async function runEstacionamento(opts: SyncEstacionamentoOpts) {
  if (opts.jsonPath && opts.placa) {
    loadPlacasParaSyncEstacionamento(opts.placa);
    const r = await processarAvisosJson(opts.placa, opts.jsonPath, {
      dryRun: opts.dryRun,
    });
    return { modo: "json-placa", resultado: r };
  }

  if (opts.placa) {
    loadPlacasParaSyncEstacionamento(opts.placa);
    const r = await sincronizarEstacionamentoVeiculo(opts.placa, { dryRun: opts.dryRun });
    return { modo: "placa", resultado: r };
  }

  const results = opts.jsonPath
    ? await processarAvisosJsonLote(opts.jsonPath, { dryRun: opts.dryRun })
    : await sincronizarEstacionamentoFrota({ dryRun: opts.dryRun });

  const resumo = resumoLista(results);
  let relatorioPath: string | null = null;

  if (!opts.dryRun) {
    ensureRelatoriosDirs();
    relatorioPath = path.join(RELATORIOS_SYNC_DIR, "_sync_estacionamento.json");
    fs.mkdirSync(path.dirname(relatorioPath), { recursive: true });
    fs.writeFileSync(
      relatorioPath,
      JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
      "utf8",
    );
  }

  return { modo: opts.jsonPath ? "json-lote" : "frota", ...resumo, relatorioPath };
}

async function runInfracoes(opts: SyncDetranScOpts) {
  const placa = opts.placa?.trim();
  const prazoDias = opts.prazoDias ?? 90;

  if (placa && !opts.noRs && ufRegistroDaPlaca(placa) === "RS") {
    return {
      redirecionado: "detran-rs",
      ...(await runDetranRs({ placa, dryRun: opts.dryRun, jsonPath: opts.jsonPath, delayMs: opts.delayMs })),
    };
  }

  if (opts.jsonPath) {
    if (!placa) throw new HttpError(400, "jsonPath exige placa");
    const raw = readJsonFile(opts.jsonPath);
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await processarRespostaDetranSc(placa, raw, {
      dryRun: opts.dryRun,
      prazoDias,
      renavam: v.renavam,
    });
    return {
      modo: "json",
      resultado: r,
      auditoria: auditarInfracoesSemCondutor(placa),
    };
  }

  if (opts.ticket) {
    if (!placa) throw new HttpError(400, "ticket exige placa");
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await sincronizarMultasPorTicketDetranSc(v.placa, opts.ticket, {
      dryRun: opts.dryRun,
      prazoDias,
      renavam: v.renavam,
    });
    return {
      modo: "ticket",
      resultado: r,
      auditoria: auditarInfracoesSemCondutor(v.placa),
    };
  }

  if (placa) {
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await sincronizarMultasVeiculoDetranSc(v.placa, v.renavam, {
      dryRun: opts.dryRun,
      prazoDias,
      captcha: opts.captcha,
    });
    return {
      modo: "placa",
      resultado: r,
      auditoria: auditarInfracoesSemCondutor(v.placa),
    };
  }

  const results = await sincronizarMultasFrotaDetranSc({
    dryRun: opts.dryRun,
    prazoDias,
    delayMs: opts.delayMs ?? 1500,
  });

  let relatorioPath: string | null = null;
  if (!opts.dryRun) {
    ensureRelatoriosDirs();
    relatorioPath = path.join(RELATORIOS_SYNC_DIR, "_sync_infracoes.json");
    fs.writeFileSync(
      relatorioPath,
      JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
      "utf8",
    );
  }

  return { modo: "frota", ...resumoLista(results), relatorioPath };
}

async function runIpvaLicenciamento(opts: SyncDetranScOpts) {
  const placa = opts.placa?.trim();

  if (placa && !opts.noRs && ufRegistroDaPlaca(placa) === "RS") {
    return {
      redirecionado: "detran-rs",
      ...(await runDetranRs({ placa, dryRun: opts.dryRun, jsonPath: opts.jsonPath, delayMs: opts.delayMs })),
    };
  }

  if (opts.jsonPath) {
    if (!placa) throw new HttpError(400, "jsonPath exige placa");
    const raw = readJsonFile(opts.jsonPath);
    const r = processarDespesasDetranSc(placa, raw, { dryRun: opts.dryRun });
    return { modo: "json", resultado: r };
  }

  if (opts.ticket) {
    if (!placa) throw new HttpError(400, "ticket exige placa");
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await sincronizarDespesasPorTicketDetranSc(v.placa, opts.ticket, {
      dryRun: opts.dryRun,
    });
    return { modo: "ticket", resultado: r };
  }

  if (placa) {
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await sincronizarDespesasVeiculoDetranSc(v.placa, v.renavam, {
      dryRun: opts.dryRun,
      captcha: opts.captcha,
    });
    return { modo: "placa", resultado: r };
  }

  const results = await sincronizarDespesasFrotaDetranSc({
    dryRun: opts.dryRun,
    delayMs: opts.delayMs ?? 1500,
  });

  let relatorioPath: string | null = null;
  if (!opts.dryRun) {
    ensureRelatoriosDirs();
    relatorioPath = path.join(RELATORIOS_SYNC_DIR, "_sync_ipva_licenciamento.json");
    fs.writeFileSync(
      relatorioPath,
      JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
      "utf8",
    );
  }

  return { modo: "frota", ...resumoLista(results), relatorioPath };
}

async function runDetranRs(opts: SyncBaseOpts & { jsonPath?: string; delayMs?: number }) {
  const placa = opts.placa?.trim();

  if (opts.jsonPath) {
    if (!placa) throw new HttpError(400, "jsonPath exige placa");
    const raw = readJsonFile(opts.jsonPath) as DetranRsConsultaVeiculo;
    const r = processarRespostaDetranRs(placa, raw, { dryRun: opts.dryRun });
    return { modo: "json", resultado: r };
  }

  if (placa) {
    const v = loadVeiculosRsParaSync(placa)[0]!;
    const r = await sincronizarVeiculoDetranRs(v.placa, v.renavam, { dryRun: opts.dryRun });
    return { modo: "placa", resultado: r };
  }

  const results = await sincronizarFrotaDetranRs({
    dryRun: opts.dryRun,
    delayMs: opts.delayMs ?? 1500,
  });

  let relatorioPath: string | null = null;
  if (!opts.dryRun) {
    ensureRelatoriosDirs();
    relatorioPath = path.join(RELATORIOS_SYNC_DIR, "_sync_detran_rs.json");
    fs.writeFileSync(
      relatorioPath,
      JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
      "utf8",
    );
  }

  return { modo: "frota", ...resumoLista(results), relatorioPath };
}

async function runSeguro(opts: SyncSeguroOpts) {
  if (opts.anos?.length) {
    const scanDirs = defaultSeguroComprovantesDirs(opts.anos);
    const { boletos, erros } = await extrairSeguroComprovantesDirs(scanDirs);
    if (opts.jsonOnly) {
      return { modo: "scan", boletos: boletos.length, erros, apenasJson: true };
    }
    let novos = 0;
    let atualizados = 0;
    let semAlteracao = 0;
    const semVeiculo: string[] = [];
    for (const b of boletos) {
      const r = sincronizarParceiroDespesa({
        placa: b.placa,
        categoria: "Seguro",
        descricao: "Seguro",
        data: b.data ?? "",
        valor: b.valor,
        competencia: b.competencia,
        origem: b.origem,
      });
      if (r.aviso?.includes("placa")) semVeiculo.push(b.placa);
      if (r.acao === "novo") novos++;
      else if (r.acao === "atualizado") atualizados++;
      else if (r.acao === "sem_alteracao") semAlteracao++;
    }
    return {
      modo: "scan",
      boletos: boletos.length,
      novos,
      atualizados,
      semAlteracao,
      semVeiculo: [...new Set(semVeiculo)],
      erros,
    };
  }

  if (!opts.boletosPath) {
    throw new HttpError(400, 'Informe "anos" ou "boletosPath"');
  }
  const p = path.resolve(opts.boletosPath);
  if (!fs.existsSync(p)) {
    throw new HttpError(400, `Ficheiro não encontrado: ${p}`);
  }
  const boletos = JSON.parse(fs.readFileSync(p, "utf8")) as Array<{
    placa: string;
    valor: number;
    data?: string;
    competencia?: string;
    origem?: string;
  }>;
  let novos = 0;
  let atualizados = 0;
  let semAlteracao = 0;
  for (const b of boletos) {
    const r = sincronizarParceiroDespesa({
      placa: b.placa,
      categoria: "Seguro",
      descricao: "Seguro",
      data: b.data ?? "",
      valor: b.valor,
      competencia: b.competencia,
      origem: b.origem,
    });
    if (r.acao === "novo") novos++;
    else if (r.acao === "atualizado") atualizados++;
    else if (r.acao === "sem_alteracao") semAlteracao++;
  }
  return { modo: "boletos", total: boletos.length, novos, atualizados, semAlteracao };
}

async function runManutencao(opts: SyncManutencaoOpts) {
  const r = await pushManutencoesToRastreame({
    placa: opts.placa,
    categoria: opts.categoria,
    dryRun: opts.dryRun,
  });
  return r;
}

export async function executarSync(syncRaw: string, input: SyncInput = {}) {
  const sync = normalizarSyncId(syncRaw);
  if (!sync) {
    throw new HttpError(400, `Sync desconhecido: ${syncRaw}`);
  }
  const opts = aplicarDirecaoSync(sync, input);

  switch (sync) {
    case "motoristas":
      return { sync, ...(await runMotoristas(opts)) };
    case "rastreaveis":
      return { sync, ...(await runRastreaveis(opts)) };
    case "rastreaveis-enviar":
      return { sync, ...(await runRastreaveis(opts)) };
    case "fipe":
      return { sync, ...(await runFipe(opts)) };
    case "recebimentos":
      return { sync, ...(await runRecebimentos(opts)) };
    case "pedagios":
      return { sync, ...(await runPedagios(opts)) };
    case "estacionamento":
      return { sync, ...(await runEstacionamento(opts)) };
    case "infracoes":
      return { sync, ...(await runInfracoes(opts)) };
    case "ipva-licenciamento":
      return { sync, ...(await runIpvaLicenciamento(opts)) };
    case "detran-rs":
      return { sync, ...(await runDetranRs(opts)) };
    case "seguro":
      return { sync, ...(await runSeguro(opts)) };
    case "manutencao":
      return { sync, ...(await runManutencao(opts)) };
    default:
      throw new HttpError(400, `Sync não implementado: ${sync}`);
  }
}

export type SyncCompletoInput = SyncInput & {
  syncs?: string[];
  opcoes?: Partial<Record<SyncId, SyncInput>>;
  async?: boolean;
};

export async function executarSyncCompleto(input: SyncCompletoInput = {}) {
  const ordem = (input.syncs?.length
    ? input.syncs.map((s) => normalizarSyncId(s)).filter((s): s is SyncId => s != null)
    : null) ?? [...SYNC_COMPLETO_ORDEM];

  if (input.syncs?.length && ordem.length !== input.syncs.length) {
    throw new HttpError(400, "Lista de syncs contém id inválido");
  }

  const resultados: Array<{ sync: SyncId; ok: boolean; data?: unknown; error?: string }> = [];

  for (const sync of ordem) {
    const { syncs: _s, opcoes: _o, async: _a, ...global } = input;
    const opts = aplicarDirecaoSync(sync, {
      ...global,
      ...(input.opcoes?.[sync] ?? {}),
    });
    try {
      const data = await executarSync(sync, opts);
      resultados.push({ sync, ok: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ sync, ok: false, error: msg });
    }
  }

  return {
    total: ordem.length,
    sucesso: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}
