import fs from "node:fs";
import path from "node:path";

import { formatPlacaHyphen } from "../placa.js";
import { REPO_ROOT } from "../repoRoot.js";
import {
  sincronizarClienteDespesa,
  atualizarPdfArquivoInfracao,
  inativarEspelhoClienteInfracao,
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
  type GravarParceiroDespesaResult,
} from "../parceiroDespesasDb.js";
import { consultarVeiculoDetranSc, consultarVeiculoDetranScComTicket, consultarVeiculoDetranScPorTicket, extrairTicketConsultaDetranSc } from "./consulta.js";
import { indexarRawInfracoesDetranSc } from "./indexRawInfracoes.js";
import { extrairMultasDetranSc } from "./mapInfracoes.js";
import { baixarPdfsInfracaoDetranSc } from "./pdfInfracao.js";
import type { DetranScMultaNormalizada } from "./types.js";

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
};

function registroPdfFromInfracao(reg: InfracaoRegistro): SincronizarClienteDespesaResult["registro"] {
  return {
    id: reg.id,
    categoria: "Infração",
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
      id: "(dry-run)",
    });
    if (infracaoDeveEspelharParceiroDespesa(reg)) {
      const parceiroInput = parceiroDespesaInputFromInfracao(reg);
      return {
        clienteDespesa: null,
        parceiroDespesa: {
          registro: {
            id: "(dry-run)",
            veiculoId: formatPlacaHyphen(placa),
            placa: formatPlacaHyphen(placa),
            categoria: parceiroInput.categoria,
            descricao: parceiroInput.descricao,
            data: parceiroInput.data,
            valor: Number(parceiroInput.valor) || 0,
            competencia: parceiroInput.competencia ?? "",
            origem: parceiroInput.origem ?? "",
          },
          aviso: null,
          acao: "novo",
        },
        pdfRegistro,
      };
    }
    if (infracaoDeveEspelharClienteDespesa(reg)) {
      return {
        clienteDespesa: {
          registro: pdfRegistro,
          aviso: null,
          acao: "novo",
        },
        parceiroDespesa: null,
        pdfRegistro,
      };
    }
    return { clienteDespesa: null, parceiroDespesa: null, pdfRegistro };
  }

  if (infracaoDeveEspelharParceiroDespesa(reg)) {
    inativarEspelhoClienteInfracao(reg.numeroAuto);
    const parceiroDespesa = sincronizarParceiroDespesa(parceiroDespesaInputFromInfracao(reg));
    return {
      clienteDespesa: null,
      parceiroDespesa,
      pdfRegistro: registroPdfFromInfracao(reg),
    };
  }

  if (infracaoDeveEspelharClienteDespesa(reg)) {
    removerParceiroDespesaPorOrigem(
      origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto),
    );
    const clienteDespesa = await sincronizarClienteDespesa(
      placa,
      clienteDespesaInputFromInfracao(reg),
      { fonteDetran: m.fonte, prazoDias: opts?.prazoDias },
    );
    if (clienteDespesa.registro.id && clienteDespesa.acao !== "ignorado") {
      vincularClienteDespesaInfracao(m.numeroAuto, clienteDespesa.registro.id);
    }
    return {
      clienteDespesa,
      parceiroDespesa: null,
      pdfRegistro: clienteDespesa.registro,
    };
  }

  return {
    clienteDespesa: null,
    parceiroDespesa: null,
    pdfRegistro: registroPdfFromInfracao(reg),
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
  };

  const all = [...cobraveis, ...historico];

  for (const m of all) {
    const { infracao: infRes, clienteDespesa: r, parceiroDespesa: p, pdfRegistro } =
      await aplicarMulta(placa, m, rawPorAuto, opts);

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
}): Promise<SyncVeiculoResult[]> {
  const veiculos = loadVeiculosParaSync(opts?.placa);
  const out: SyncVeiculoResult[] = [];
  const delay = opts?.delayMs ?? 1500;

  for (let i = 0; i < veiculos.length; i++) {
    const v = veiculos[i]!;
    try {
      const r = await sincronizarMultasVeiculoDetranSc(v.placa, v.renavam, {
        dryRun: opts?.dryRun,
        prazoDias: opts?.prazoDias,
      });
      out.push(r);
    } catch (e) {
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
      });
    }
    if (i < veiculos.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return out;
}
