import fs from "node:fs";
import path from "node:path";

import { CategoriaDespesaCliente } from "../domain/categoriaDespesaCliente.js";
import type { DetranScInfracao } from "./types.js";
import { formatPlacaHyphen } from "../placa.js";
import { REPO_ROOT } from "../repoRoot.js";
import {
  sincronizarClienteDespesa,
  atualizarPdfArquivoInfracao,
  excluirClienteDespesa,
  loadClienteDespesasDb,
  simularSincronizarClienteDespesa,
  type ClienteDespesaRegistro,
  type SincronizarClienteDespesaResult,
} from "../clienteDespesasDb.js";
import {
  atualizarPdfArquivoInfracaoDb,
  atualizarNotificacaoPdfArquivoInfracaoDb,
  clienteDespesaInputFromInfracao,
  inputInfracaoFromDetran,
  infracaoDeveEspelharClienteDespesa,
  infracaoDeveEspelharParceiroDespesa,
  origemParceiroInfracaoSemLocatario,
  parceiroDespesaInputFromInfracao,
  sincronizarInfracao,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
} from "../infracoesDb.js";
import { caminhoRelativoPdfSalvo, localizarPdfInfracaoExistente, salvarPdfInfracao } from "../infracaoPdfStorage.js";
import {
  sincronizarParceiroDespesa,
  removerParceiroDespesaPorOrigem,
  findParceiroDespesaPorOrigem,
  type GravarParceiroDespesaResult,
} from "../parceiroDespesasDb.js";
import { consultarVeiculoDetranSc, consultarVeiculoDetranScComTicket, consultarVeiculoDetranScPorTicket, extrairTicketConsultaDetranSc } from "./consulta.js";
import { indexarRawInfracoesDetranSc } from "./indexRawInfracoes.js";
import { extrairMultasDetranSc } from "./mapInfracoes.js";
import { baixarPdfsInfracaoDetranSc } from "./pdfInfracao.js";
import type { DetranScMultaNormalizada } from "./types.js";
import {
  acaoParaStatusSync,
  type SyncAlteracaoLinha,
} from "./syncAlteracoes.js";

export type VeiculoFrota = {
  placa: string;
  renavam: string;
};

export type SyncVeiculoResult = {
  placa: string;
  /** Registos novos em database/infracoes.json */
  infracoesNovos: number;
  /** Registos atualizados em database/infracoes.json */
  infracoesAtualizados: number;
  novos: number;
  atualizados: number;
  semAlteracao: number;
  historico: number;
  /** Débitos parceiro ignorados na extração de multas (IPVA/licenciamento — fluxo syncDespesasVeiculo). */
  debitosIgnoradosProprietario: number;
  /** Infrações sem locatário espelhadas em parceiro-despesas.json (novos). */
  parceiroNovos: number;
  /** Infrações sem locatário espelhadas em parceiro-despesas.json (atualizados). */
  parceiroAtualizados: number;
  /** Quitada DETRAN sem data — auto ausente; não cadastrado. */
  ignorados: number;
  /** Infrações sem data de autuação (precisam de revisão manual). */
  revisarManual: number;
  /** PDFs de infração gravados em pasta Débitos. */
  pdfsGravados: number;
  /** Tentativas de PDF sem sucesso. */
  pdfsFalha: number;
  avisos: string[];
  /** Detalhe por registro para a UI de sync (cadastrado / alterado / excluído / …). */
  alteracoes: SyncAlteracaoLinha[];
};

function loadVeiculosFrota(placaFiltro?: string): VeiculoFrota[] {
  const p = path.join(REPO_ROOT, "database", "veiculos.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
    veiculos?: { placa?: string; renavam?: string; ativo?: boolean; ufRegistro?: string }[];
  };
  const filtro = placaFiltro ? formatPlacaHyphen(placaFiltro) : null;

  return (j.veiculos ?? [])
    // Sync atualiza apenas veículos ATIVOS (sync-veiculo/cliente é que tratam inativos).
    .filter((v) => v.ativo !== false)
    // DETRAN SC só tem dados de veículos registrados em SC — pular outras UFs.
    .filter((v) => !v.ufRegistro || v.ufRegistro.toUpperCase() === "SC")
    .filter((v) => v.placa && v.renavam)
    .filter((v) => !filtro || formatPlacaHyphen(v.placa!) === filtro)
    .map((v) => ({ placa: v.placa!, renavam: String(v.renavam!) }));
}

type EspelhoInfracaoResult = {
  infracao: ReturnType<typeof sincronizarInfracao>;
  clienteDespesa: SincronizarClienteDespesaResult | null;
  parceiroDespesa: GravarParceiroDespesaResult | null;
  /** Registro usado para PDF (cliente ou infração canônica). */
  pdfRegistro: SincronizarClienteDespesaResult["registro"];
  alteracoes: SyncAlteracaoLinha[];
};

function linhaInfracao(
  placa: string,
  m: DetranScMultaNormalizada,
  acao: string,
  aviso?: string | null,
): SyncAlteracaoLinha {
  return {
    placa: formatPlacaHyphen(placa),
    entidade: "infracao",
    referencia: m.autoInfracao,
    descricao: m.descricao,
    valor: m.valorMulta,
    data: m.dataAutuacao || null,
    status: acaoParaStatusSync(acao),
    aviso: aviso ?? null,
  };
}

function linhaCobranca(
  placa: string,
  reg: ClienteDespesaRegistro,
  acao: string,
  aviso?: string | null,
): SyncAlteracaoLinha {
  return {
    placa: formatPlacaHyphen(placa),
    entidade: "cobranca",
    referencia: reg.autoInfracao || reg.id,
    descricao: reg.descricao || reg.titulo || "",
    valor: reg.valorMulta ?? null,
    data: reg.dataAutuacao || null,
    status: acaoParaStatusSync(acao),
    aviso: aviso ?? null,
  };
}

function buscarClienteDespesaPorAuto(numeroAuto: string): ClienteDespesaRegistro | null {
  const key = numeroAuto.trim().toUpperCase();
  if (!key) return null;
  const db = loadClienteDespesasDb();
  return db.clienteDespesas.find((m) => m.autoInfracao.trim().toUpperCase() === key) ?? null;
}

function linhaParceiro(
  placa: string,
  reg: GravarParceiroDespesaResult["registro"],
  acao: string,
  aviso?: string | null,
): SyncAlteracaoLinha {
  return {
    placa: formatPlacaHyphen(placa),
    entidade: "despesa_parceiro",
    referencia: reg.origem || reg.id,
    descricao: reg.descricao || reg.categoria,
    valor: reg.valor ?? null,
    data: reg.data || null,
    status: acaoParaStatusSync(acao),
    aviso: aviso ?? null,
  };
}

function registroPdfFromInfracao(reg: InfracaoRegistro): SincronizarClienteDespesaResult["registro"] {
  return {
    id: reg.id,
    categoria: CategoriaDespesaCliente.Infracao,
    veiculoId: reg.veiculoId,
    autoInfracao: reg.numeroAuto,
    numeroAuto: reg.numeroAuto,
    descricao: reg.descricao,
    localInfracao: reg.localInfracao,
    dataAutuacao: reg.dataAutuacao,
    valorMulta: reg.valorMulta,
    situacao: reg.situacao,
    limiteDefesa: reg.limiteDefesa,
    dataLimiteDefesa: reg.dataLimiteDefesa,
    dataVencimentoOriginal: reg.dataVencimentoOriginal,
    convertidaEmDebito: reg.convertidaEmDebito,
    condutorId: reg.condutorId,
    condutorConfirmado: reg.condutorConfirmado,
    condutorContrato: reg.condutorContrato,
    condutorNaoIdentificado: reg.condutorNaoIdentificado,
    revisarManual: reg.revisarManual,
    quitadaDetran: reg.quitadaDetran,
    statusInfracao: reg.statusInfracao as string | undefined,
    statusDetran: reg.statusDetran,
    pdfArquivo: reg.pdfArquivo,
    cadastradoEm: reg.cadastradoEm,
    atualizadoEm: reg.atualizadoEm,
    origem: reg.origem,
  };
}

async function espelharDebitoInfracao(
  placa: string,
  m: DetranScMultaNormalizada,
  infracao: ReturnType<typeof sincronizarInfracao>,
  opts?: { dryRun?: boolean; prazoDias?: number },
): Promise<Omit<EspelhoInfracaoResult, "infracao">> {
  const reg = infracao.registro;

  if (opts?.dryRun === true) {
    const pdfRegistro = registroPdfFromInfracao({
      ...reg,
      id: reg.id || "(dry-run)",
    });
    const alteracoes: SyncAlteracaoLinha[] = [];

    if (infracaoDeveEspelharParceiroDespesa(reg)) {
      const excluido = buscarClienteDespesaPorAuto(reg.numeroAuto);
      if (excluido) {
        alteracoes.push({
          ...linhaCobranca(placa, excluido, "sem_alteracao"),
          status: "excluido",
        });
      }
      const parceiroDespesa = sincronizarParceiroDespesa(parceiroDespesaInputFromInfracao(reg), {
        dryRun: true,
      });
      alteracoes.push(
        linhaParceiro(placa, parceiroDespesa.registro, parceiroDespesa.acao, parceiroDespesa.aviso),
      );
      return {
        clienteDespesa: null,
        parceiroDespesa,
        pdfRegistro,
        alteracoes,
      };
    }
    if (infracaoDeveEspelharClienteDespesa(reg)) {
      const origemParceiro = origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto);
      const parceiroAntigo = findParceiroDespesaPorOrigem(origemParceiro);
      if (parceiroAntigo) {
        alteracoes.push({
          ...linhaParceiro(placa, parceiroAntigo, "sem_alteracao"),
          status: "excluido",
        });
      }
      const clienteDespesa = simularSincronizarClienteDespesa(
        placa,
        clienteDespesaInputFromInfracao(reg),
      );
      alteracoes.push(
        linhaCobranca(placa, clienteDespesa.registro, clienteDespesa.acao, clienteDespesa.aviso),
      );
      return {
        clienteDespesa,
        parceiroDespesa: null,
        pdfRegistro: clienteDespesa.registro,
        alteracoes,
      };
    }
    return { clienteDespesa: null, parceiroDespesa: null, pdfRegistro, alteracoes };
  }

  const alteracoes: SyncAlteracaoLinha[] = [];

  if (infracaoDeveEspelharParceiroDespesa(reg)) {
    const excluido = await excluirClienteDespesa(reg.numeroAuto, { syncRastreame: false });
    if (excluido) {
      alteracoes.push({
        ...linhaCobranca(placa, excluido, "sem_alteracao"),
        status: "excluido",
      });
    }
    const parceiroDespesa = sincronizarParceiroDespesa(parceiroDespesaInputFromInfracao(reg));
    alteracoes.push(linhaParceiro(placa, parceiroDespesa.registro, parceiroDespesa.acao, parceiroDespesa.aviso));
    return {
      clienteDespesa: null,
      parceiroDespesa,
      pdfRegistro: registroPdfFromInfracao(reg),
      alteracoes,
    };
  }

  if (infracaoDeveEspelharClienteDespesa(reg)) {
    const origemParceiro = origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto);
    const parceiroAntigo = findParceiroDespesaPorOrigem(origemParceiro);
    if (parceiroAntigo && removerParceiroDespesaPorOrigem(origemParceiro)) {
      alteracoes.push({
        ...linhaParceiro(placa, parceiroAntigo, "sem_alteracao"),
        status: "excluido",
      });
    }
    const clienteDespesa = await sincronizarClienteDespesa(
      placa,
      clienteDespesaInputFromInfracao(reg),
      { fonteDetran: m.fonte, prazoDias: opts?.prazoDias },
    );
    if (clienteDespesa.registro.id && clienteDespesa.acao !== "ignorado") {
      vincularClienteDespesaInfracao(m.numeroAuto, clienteDespesa.registro.id);
    }
    alteracoes.push(
      linhaCobranca(placa, clienteDespesa.registro, clienteDespesa.acao, clienteDespesa.aviso),
    );
    return {
      clienteDespesa,
      parceiroDespesa: null,
      pdfRegistro: clienteDespesa.registro,
      alteracoes,
    };
  }

  return {
    clienteDespesa: null,
    parceiroDespesa: null,
    pdfRegistro: registroPdfFromInfracao(reg),
    alteracoes,
  };
}

async function aplicarMulta(
  placa: string,
  m: DetranScMultaNormalizada,
  rawPorAuto: ReturnType<typeof indexarRawInfracoesDetranSc>,
  opts?: { dryRun?: boolean; prazoDias?: number },
): Promise<EspelhoInfracaoResult> {
  const rawItem = rawPorAuto.get(m.autoInfracao.trim().toUpperCase());
  const infracaoInput = inputInfracaoFromDetran(m, rawItem);
  const infracao = sincronizarInfracao(placa, infracaoInput, {
    dryRun: opts?.dryRun,
    prazoDias: opts?.prazoDias,
  });

  const espelho = await espelharDebitoInfracao(placa, m, infracao, opts);
  return { infracao, ...espelho };
}

async function tentarBaixarPdfInfracao(
  placa: string,
  renavam: string,
  m: DetranScMultaNormalizada,
  registro: SincronizarClienteDespesaResult["registro"],
  rawPorAuto: ReturnType<typeof indexarRawInfracoesDetranSc>,
  opts?: {
    dryRun?: boolean;
    ticket?: string;
    detranRaw?: Record<string, unknown> | null;
    notificacaoPdfArquivo?: string | null;
  },
): Promise<{ gravados: number; avisos: string[]; falhas: number }> {
  const avisos: string[] = [];
  if (!registro?.autoInfracao || registro.id === "(dry-run)") {
    return { gravados: 0, avisos, falhas: 0 };
  }

  const rawItem =
    rawPorAuto.get(m.autoInfracao.trim().toUpperCase()) ??
    (opts?.detranRaw as DetranScInfracao | undefined);

  const aitExistente = localizarPdfInfracaoExistente(registro, "ait", registro.pdfArquivo);
  const naExistente = localizarPdfInfracaoExistente(
    registro,
    "na",
    opts?.notificacaoPdfArquivo,
  );

  if (aitExistente) {
    avisos.push(`${m.autoInfracao} [AIT]: PDF já existe (pulado): ${aitExistente}`);
    if (!opts?.dryRun && !registro.pdfArquivo) {
      const rel = caminhoRelativoPdfSalvo(aitExistente);
      atualizarPdfArquivoInfracaoDb(m.autoInfracao, rel);
      atualizarPdfArquivoInfracao(m.autoInfracao, rel);
      registro.pdfArquivo = rel;
    }
  }
  if (naExistente) {
    avisos.push(`${m.autoInfracao} [NA]: PDF já existe (pulado): ${naExistente}`);
    if (!opts?.dryRun && !opts?.notificacaoPdfArquivo) {
      atualizarNotificacaoPdfArquivoInfracaoDb(
        m.autoInfracao,
        caminhoRelativoPdfSalvo(naExistente),
      );
    }
  }

  const baixarAit = !aitExistente;
  const baixarNa = !naExistente;
  if (!baixarAit && !baixarNa) {
    return { gravados: 0, avisos, falhas: 0 };
  }

  const pdfs = await baixarPdfsInfracaoDetranSc({
    placa,
    renavam,
    autoInfracao: m.autoInfracao,
    ticket: opts?.ticket,
    rawItem,
    detranRaw: opts?.detranRaw,
    baixarAit,
    baixarNa,
  });

  let gravados = 0;
  let falhas = 0;

  if (baixarAit) {
    if (pdfs.ait.buffer) {
      const saved = salvarPdfInfracao(pdfs.ait.buffer, registro, {
        dryRun: opts?.dryRun,
        tipo: "ait",
      });
      avisos.push(...saved.avisos.map((a) => `${m.autoInfracao} [AIT]: ${a}`));
      if (saved.pdfArquivo) {
        gravados++;
        if (!opts?.dryRun) {
          atualizarPdfArquivoInfracaoDb(m.autoInfracao, saved.pdfArquivo);
          atualizarPdfArquivoInfracao(m.autoInfracao, saved.pdfArquivo);
          registro.pdfArquivo = saved.pdfArquivo;
        }
      }
    } else {
      falhas++;
      if (pdfs.ait.aviso) avisos.push(`${m.autoInfracao} [AIT]: ${pdfs.ait.aviso}`);
    }
  }

  if (baixarNa) {
    if (pdfs.notificacao.buffer) {
      const saved = salvarPdfInfracao(pdfs.notificacao.buffer, registro, {
        dryRun: opts?.dryRun,
        tipo: "na",
      });
      avisos.push(...saved.avisos.map((a) => `${m.autoInfracao} [NA]: ${a}`));
      if (saved.pdfArquivo) {
        gravados++;
        if (!opts?.dryRun) {
          atualizarNotificacaoPdfArquivoInfracaoDb(m.autoInfracao, saved.pdfArquivo);
        }
      }
    } else {
      falhas++;
      if (pdfs.notificacao.aviso) {
        avisos.push(`${m.autoInfracao} [NA]: ${pdfs.notificacao.aviso}`);
      }
    }
  }

  return { gravados, avisos, falhas };
}

export async function sincronizarMultasVeiculoDetranSc(
  placa: string,
  renavam: string,
  opts?: { dryRun?: boolean; prazoDias?: number; captcha?: string },
): Promise<SyncVeiculoResult> {
  const { data: raw, ticket } = await consultarVeiculoDetranScComTicket(placa, renavam, {
    captcha: opts?.captcha,
  });
  return processarRespostaDetranSc(placa, raw, { ...opts, renavam, ticket: ticket ?? undefined });
}

export async function sincronizarMultasPorTicketDetranSc(
  placa: string,
  ticket: string,
  opts?: { dryRun?: boolean; prazoDias?: number; renavam?: string },
): Promise<SyncVeiculoResult> {
  const raw = await consultarVeiculoDetranScPorTicket(ticket);
  return processarRespostaDetranSc(placa, raw, { ...opts, ticket });
}

export async function processarRespostaDetranSc(
  placa: string,
  raw: unknown,
  opts?: { dryRun?: boolean; prazoDias?: number; renavam?: string; ticket?: string },
): Promise<SyncVeiculoResult> {
  const { cobraveis, historico, debitosIgnoradosProprietario } =
    extrairMultasDetranSc(raw);
  const rawPorAuto = indexarRawInfracoesDetranSc(raw);
  const renavam = opts?.renavam ?? "";
  const ticket = opts?.ticket ?? extrairTicketConsultaDetranSc(raw) ?? undefined;

  const result: SyncVeiculoResult = {
    placa: formatPlacaHyphen(placa),
    infracoesNovos: 0,
    infracoesAtualizados: 0,
    novos: 0,
    atualizados: 0,
    semAlteracao: 0,
    historico: 0,
    debitosIgnoradosProprietario,
    ignorados: 0,
    revisarManual: 0,
    parceiroNovos: 0,
    parceiroAtualizados: 0,
    pdfsGravados: 0,
    pdfsFalha: 0,
    avisos: [],
    alteracoes: [],
  };

  const all = [...cobraveis, ...historico];

  for (const m of all) {
    const { infracao: infRes, clienteDespesa: r, parceiroDespesa: p, pdfRegistro, alteracoes: espelhoAlt } =
      await aplicarMulta(placa, m, rawPorAuto, opts);

    result.alteracoes.push(linhaInfracao(placa, m, infRes.acao, infRes.aviso));
    result.alteracoes.push(...espelhoAlt);

    if (infRes.acao === "novo") result.infracoesNovos++;
    else if (infRes.acao === "atualizado") result.infracoesAtualizados++;

    if (m.quitadaDetran) result.historico++;
    if (
      infRes.registro.revisarManual ||
      r?.registro.revisarManual
    ) {
      result.revisarManual++;
    }

    if (r) {
      if (r.acao === "novo") result.novos++;
      else if (r.acao === "atualizado") result.atualizados++;
      else if (r.acao === "ignorado") result.ignorados++;
      else result.semAlteracao++;
      if (r.aviso) result.avisos.push(`${m.autoInfracao}: ${r.aviso}`);
    }

    if (p) {
      if (p.acao === "novo") result.parceiroNovos++;
      else if (p.acao === "atualizado") result.parceiroAtualizados++;
      else result.semAlteracao++;
      if (p.aviso) result.avisos.push(`${m.autoInfracao}: parceiro — ${p.aviso}`);
    }

    if (!r && !p && infRes.acao === "sem_alteracao") result.semAlteracao++;

    if (infRes.aviso && infRes.aviso !== r?.aviso) {
      result.avisos.push(`${m.autoInfracao}: ${infRes.aviso}`);
    }

    const pdfAlvo = r?.acao !== "ignorado" ? (r?.registro ?? pdfRegistro) : pdfRegistro;
    if (renavam && pdfAlvo?.autoInfracao && pdfAlvo.id !== "") {
      const pdf = await tentarBaixarPdfInfracao(
        placa,
        renavam,
        m,
        pdfAlvo,
        rawPorAuto,
        {
          ...opts,
          ticket,
          detranRaw: infRes.registro.detranRaw,
          notificacaoPdfArquivo: infRes.registro.notificacaoPdfArquivo,
        },
      );
      if (pdf.gravados > 0) result.pdfsGravados += pdf.gravados;
      if (pdf.falhas > 0) result.pdfsFalha += pdf.falhas;
      result.avisos.push(...pdf.avisos);
    }
  }

  return result;
}

export function loadVeiculosParaSync(placaFiltro?: string): VeiculoFrota[] {
  const list = loadVeiculosFrota(placaFiltro);
  if (placaFiltro && list.length === 0) {
    throw new Error(`Placa não encontrada em veiculos.json: ${placaFiltro}`);
  }
  return list;
}

export async function sincronizarMultasFrotaDetranSc(opts?: {
  placa?: string;
  dryRun?: boolean;
  prazoDias?: number;
  delayMs?: number;
  onProgress?: (done: number, total: number, falhas: number) => void;
}): Promise<SyncVeiculoResult[]> {
  const veiculos = loadVeiculosParaSync(opts?.placa);
  const out: SyncVeiculoResult[] = [];
  const delay = opts?.delayMs ?? 1500;
  const total = veiculos.length;
  let falhasAcum = 0;

  opts?.onProgress?.(0, total, 0);

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]!;
    try {
      const r = await sincronizarMultasVeiculoDetranSc(v.placa, v.renavam, {
        dryRun: opts?.dryRun,
        prazoDias: opts?.prazoDias,
      });
      out.push(r);
      if (r.avisos.length > 0) falhasAcum++;
    } catch (e) {
      falhasAcum++;
      out.push({
        placa: formatPlacaHyphen(v.placa),
        infracoesNovos: 0,
        infracoesAtualizados: 0,
        novos: 0,
        atualizados: 0,
        semAlteracao: 0,
        historico: 0,
        debitosIgnoradosProprietario: 0,
        ignorados: 0,
        revisarManual: 0,
        parceiroNovos: 0,
        parceiroAtualizados: 0,
        pdfsGravados: 0,
        pdfsFalha: 0,
        avisos: [e instanceof Error ? e.message : String(e)],
        alteracoes: [],
      });
    }
    opts?.onProgress?.(i + 1, total, falhasAcum);
    if (i < veiculos.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return out;
}
