import fs from "node:fs";
import path from "node:path";

import {
  auditarInfracoesSemCondutor,
  defaultSeguroAnos,
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
  syncRecebimentos,
  ufRegistroDaPlaca,
  flattenAlteracoesSync,
  type DetranRsConsultaVeiculo,
  type FipeSyncProgress,
  type SyncAlteracaoLinha,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";
import * as estacionamentoService from "../estacionamento.js";
import * as fipeService from "../fipe.js";
import type { JobProgress } from "./jobsTypes.js";
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
  /** Só veículos sem FIPE (não reconsulta quem já tem). */
  faltantes?: boolean;
  /** Progresso do job async (não serializar no input do job). */
  onProgress?: (p: FipeSyncProgress) => void;
};

export type SyncDetranScOpts = SyncBaseOpts & {
  ticket?: string;
  captcha?: string;
  jsonPath?: string;
  prazoDias?: number;
  delayMs?: number;
  noRs?: boolean;
  onProgress?: (p: JobProgress) => void;
};

export type SyncPedagiosOpts = SyncBaseOpts & {
  jsonPath?: string;
  normalizarTitulos?: boolean;
  onProgress?: (p: JobProgress) => void;
};

export type SyncEstacionamentoOpts = SyncBaseOpts & {
  jsonPath?: string;
  onProgress?: (p: JobProgress) => void;
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

function alteracoesFromFipe(result: {
  resultados?: Array<{
    placa: string;
    ok: boolean;
    fipeCodigo?: string;
    fipeModelo?: string;
    marcaModelo?: string;
    fipeValor?: string;
    erro?: string;
  }>;
}): SyncAlteracaoLinha[] {
  const out: SyncAlteracaoLinha[] = [];
  for (const r of result.resultados ?? []) {
    const valor = r.fipeValor
      ? Number(String(r.fipeValor).replace(/[^\d,.-]/g, "").replace(",", ".")) || null
      : null;
    out.push({
      placa: r.placa,
      entidade: "fipe",
      referencia: r.fipeCodigo ?? r.placa,
      descricao: r.fipeModelo ?? r.marcaModelo ?? "FIPE",
      valor: Number.isFinite(valor as number) ? valor : null,
      status: !r.ok ? "ignorado" : "alterado",
      aviso: r.erro ?? null,
    });
  }
  return out;
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
  let data: Awaited<ReturnType<typeof fipeService.atualizarFipeFrota>>;
  if (opts.placa?.trim()) {
    data = await fipeService.atualizarFipeVeiculo(opts.placa.trim());
  } else if (opts.faltantes) {
    data = await fipeService.atualizarFipeFaltantes(opts.onProgress);
  } else {
    data = await fipeService.atualizarFipeFrota(opts.onProgress);
  }
  return { ...data, alteracoes: alteracoesFromFipe(data) };
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
  const report = (
    done: number,
    total: number,
    extra?: Pick<JobProgress, "sucesso" | "falhas" | "fase">,
  ) => {
    opts.onProgress?.({
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      sucesso: extra?.sucesso ?? 0,
      falhas: extra?.falhas ?? 0,
      fase: extra?.fase,
    });
  };

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
    return { modo: "json-placa", resultado: r, alteracoes: r.alteracoes };
  }

  if (opts.placa) {
    loadPlacasParaSync(opts.placa);
    report(0, 1, { fase: `Consultando ${opts.placa}…` });
    const r = await sincronizarPedagiosVeiculo(opts.placa, { dryRun: opts.dryRun });
    const falhas = r.avisos.length > 0 ? 1 : 0;
    report(1, 1, { sucesso: 1 - falhas, falhas, fase: "Concluído" });
    return { modo: "placa", resultado: r, alteracoes: r.alteracoes };
  }

  const placas = loadPlacasParaSync(opts.placa);
  const total = Math.max(placas.length, 1);
  report(0, total, { fase: "Consultando pedagiodigital.com…" });

  const results = opts.jsonPath
    ? await processarPassagensJsonLote(opts.jsonPath, { dryRun: opts.dryRun })
    : await sincronizarPedagiosFrota({
        dryRun: opts.dryRun,
        onProgress: (done, t, falhasParciais) => {
          report(done, t, {
            sucesso: done - falhasParciais,
            falhas: falhasParciais,
            fase: done >= t ? "Gravando relatório…" : "Processando passagens…",
          });
        },
      });

  const resumo = resumoLista(results);
  let falhas = 0;
  for (const r of results) {
    if (r.avisos.length > 0) falhas++;
  }
  report(total, total, {
    sucesso: results.length - falhas,
    falhas,
    fase: opts.dryRun ? "Concluído (dry-run)" : "Espelhando no Rastreame…",
  });
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

  report(total, total, {
    sucesso: results.length - falhas,
    falhas,
    fase: "Concluído",
  });

  return {
    modo: opts.jsonPath ? "json-lote" : "frota",
    ...resumo,
    push,
    relatorioPath,
    alteracoes: flattenAlteracoesSync(results),
  };
}

async function runEstacionamento(opts: SyncEstacionamentoOpts) {
  const report = (
    done: number,
    total: number,
    extra?: Pick<JobProgress, "sucesso" | "falhas" | "fase">,
  ) => {
    opts.onProgress?.({
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      sucesso: extra?.sucesso ?? 0,
      falhas: extra?.falhas ?? 0,
      fase: extra?.fase,
    });
  };

  if (opts.jsonPath && opts.placa) {
    loadPlacasParaSyncEstacionamento(opts.placa);
    const r = await processarAvisosJson(opts.placa, opts.jsonPath, {
      dryRun: opts.dryRun,
    });
    return { modo: "json-placa", resultado: r, alteracoes: r.alteracoes };
  }

  if (opts.placa) {
    loadPlacasParaSyncEstacionamento(opts.placa);
    report(0, 1, { fase: `Consultando ${opts.placa} no SigaPay…` });
    let portal: Awaited<ReturnType<typeof estacionamentoService.listarAvisosPlaca>> | null = null;
    try {
      portal = await estacionamentoService.listarAvisosPlaca(opts.placa, "aberto");
    } catch {
      /* opcional */
    }
    const r = await sincronizarEstacionamentoVeiculo(opts.placa, { dryRun: opts.dryRun });
    const falhas = r.avisos.length > 0 ? 1 : 0;
    report(1, 1, { sucesso: 1 - falhas, falhas, fase: "Concluído" });
    return { modo: "placa", resultado: r, portal, alteracoes: r.alteracoes };
  }

  const placas = loadPlacasParaSyncEstacionamento(opts.placa);
  const total = Math.max(placas.length, 1);
  report(0, total, { fase: "Consultando sigapay.com.br…" });

  let portalAvisos: Awaited<ReturnType<typeof estacionamentoService.listarAvisosFrota>> | null =
    null;
  try {
    portalAvisos = await estacionamentoService.listarAvisosFrota("aberto", opts.placa);
  } catch {
    /* resumo opcional — sync continua */
  }

  const results = opts.jsonPath
    ? await processarAvisosJsonLote(opts.jsonPath, { dryRun: opts.dryRun })
    : await sincronizarEstacionamentoFrota({
        dryRun: opts.dryRun,
        onProgress: (done, t, falhasParciais) => {
          report(done, t, {
            sucesso: done - falhasParciais,
            falhas: falhasParciais,
            fase: done >= t ? "Gravando relatório…" : "Processando avisos…",
          });
        },
      });

  const resumo = resumoLista(results);
  let falhas = 0;
  for (const r of results) {
    if (r.avisos.length > 0) falhas++;
  }
  report(total, total, {
    sucesso: results.length - falhas,
    falhas,
    fase: opts.dryRun ? "Concluído (dry-run)" : "Concluído",
  });
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

  return {
    modo: opts.jsonPath ? "json-lote" : "frota",
    ...resumo,
    relatorioPath,
    portal: portalAvisos,
    alteracoes: flattenAlteracoesSync(results),
  };
}

async function runInfracoes(opts: SyncDetranScOpts) {
  const placa = opts.placa?.trim();
  const prazoDias = opts.prazoDias ?? 90;

  const report = (
    done: number,
    total: number,
    extra?: Pick<JobProgress, "sucesso" | "falhas" | "fase">,
  ) => {
    opts.onProgress?.({
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      sucesso: extra?.sucesso ?? 0,
      falhas: extra?.falhas ?? 0,
      fase: extra?.fase,
    });
  };

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
      alteracoes: r.alteracoes,
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
      alteracoes: r.alteracoes,
    };
  }

  if (placa) {
    const v = loadVeiculosParaSync(placa)[0]!;
    report(0, 1, { fase: `Consultando ${v.placa}…` });
    const r = await sincronizarMultasVeiculoDetranSc(v.placa, v.renavam, {
      dryRun: opts.dryRun,
      prazoDias,
      captcha: opts.captcha,
    });
    const falhas = r.avisos.length > 0 ? 1 : 0;
    report(1, 1, { sucesso: 1 - falhas, falhas, fase: "Concluído" });
    return {
      modo: "placa",
      resultado: r,
      auditoria: auditarInfracoesSemCondutor(v.placa),
      alteracoes: r.alteracoes,
    };
  }

  const veiculos = loadVeiculosParaSync(opts.placa);
  const total = Math.max(veiculos.length, 1);
  report(0, total, { fase: "Consultando DETRAN SC…" });

  const results = await sincronizarMultasFrotaDetranSc({
    dryRun: opts.dryRun,
    prazoDias,
    delayMs: opts.delayMs ?? 1500,
    onProgress: (done, t, falhasParciais) => {
      report(done, t, {
        sucesso: done - falhasParciais,
        falhas: falhasParciais,
        fase: done >= t ? "Gravando relatório…" : "Processando infrações…",
      });
    },
  });

  let falhas = 0;
  for (const r of results) {
    if (r.avisos.length > 0) falhas++;
  }
  report(total, total, {
    sucesso: results.length - falhas,
    falhas,
    fase: opts.dryRun ? "Concluído (dry-run)" : "Concluído",
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

  return {
    modo: "frota",
    ...resumoLista(results),
    relatorioPath,
    alteracoes: flattenAlteracoesSync(results),
  };
}

async function runIpvaLicenciamento(opts: SyncDetranScOpts) {
  const placa = opts.placa?.trim();

  const report = (
    done: number,
    total: number,
    extra?: Pick<JobProgress, "sucesso" | "falhas" | "fase">,
  ) => {
    opts.onProgress?.({
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      sucesso: extra?.sucesso ?? 0,
      falhas: extra?.falhas ?? 0,
      fase: extra?.fase,
    });
  };

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
    return { modo: "json", resultado: r, alteracoes: r.alteracoes };
  }

  if (opts.ticket) {
    if (!placa) throw new HttpError(400, "ticket exige placa");
    const v = loadVeiculosParaSync(placa)[0]!;
    const r = await sincronizarDespesasPorTicketDetranSc(v.placa, opts.ticket, {
      dryRun: opts.dryRun,
    });
    return { modo: "ticket", resultado: r, alteracoes: r.alteracoes };
  }

  if (placa) {
    const v = loadVeiculosParaSync(placa)[0]!;
    report(0, 1, { fase: `Consultando ${v.placa}…` });
    const r = await sincronizarDespesasVeiculoDetranSc(v.placa, v.renavam, {
      dryRun: opts.dryRun,
      captcha: opts.captcha,
    });
    const falhas = r.avisos.length > 0 ? 1 : 0;
    report(1, 1, { sucesso: 1 - falhas, falhas, fase: "Concluído" });
    return { modo: "placa", resultado: r, alteracoes: r.alteracoes };
  }

  const veiculos = loadVeiculosParaSync(opts.placa);
  const total = Math.max(veiculos.length, 1);
  report(0, total, { fase: "Consultando DETRAN SC…" });

  const results = await sincronizarDespesasFrotaDetranSc({
    dryRun: opts.dryRun,
    delayMs: opts.delayMs ?? 1500,
    onProgress: (done, t, falhasParciais) => {
      report(done, t, {
        sucesso: done - falhasParciais,
        falhas: falhasParciais,
        fase: done >= t ? "Gravando relatório…" : "Processando IPVA/licenciamento…",
      });
    },
  });

  let falhas = 0;
  for (const r of results) {
    if (r.avisos.length > 0) falhas++;
  }
  report(total, total, {
    sucesso: results.length - falhas,
    falhas,
    fase: opts.dryRun ? "Concluído (dry-run)" : "Concluído",
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

  return {
    modo: "frota",
    ...resumoLista(results),
    relatorioPath,
    alteracoes: flattenAlteracoesSync(results),
  };
}

async function runDetranRs(opts: SyncBaseOpts & { jsonPath?: string; delayMs?: number }) {
  const placa = opts.placa?.trim();

  if (opts.jsonPath) {
    if (!placa) throw new HttpError(400, "jsonPath exige placa");
    const raw = readJsonFile(opts.jsonPath) as DetranRsConsultaVeiculo;
    const r = processarRespostaDetranRs(placa, raw, { dryRun: opts.dryRun });
    return { modo: "json", resultado: r, alteracoes: r.alteracoes };
  }

  if (placa) {
    const v = loadVeiculosRsParaSync(placa)[0]!;
    const r = await sincronizarVeiculoDetranRs(v.placa, v.renavam, { dryRun: opts.dryRun });
    return { modo: "placa", resultado: r, alteracoes: r.alteracoes };
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

  return {
    modo: "frota",
    ...resumoLista(results),
    relatorioPath,
    alteracoes: flattenAlteracoesSync(results),
  };
}

async function runSeguro(opts: SyncSeguroOpts) {
  const anos =
    opts.anos?.length ? opts.anos : opts.boletosPath ? undefined : defaultSeguroAnos();

  if (anos?.length) {
    const scanDirs = defaultSeguroComprovantesDirs(anos);
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
      anos,
      pastas: scanDirs,
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
