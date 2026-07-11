/**
 * Gera cobranças em lote por tipo (somente alvos elegíveis em aberto).
 */
import fs from "node:fs";
import path from "node:path";

import {
  gerarEstacionamento,
  gerarManutencao,
  gerarMultas,
  gerarPedagio,
  gerarRenegociacao,
  gerarSemanal,
  salvarCobranca,
  COBRANCAS_OUT_DIR,
  type ResultadoCobranca,
  type TipoCobranca,
} from "./cobrancas.js";
import {
  listarAlvosCobranca,
  type AlvoCobranca,
  type FiltroAlvosCobranca,
  type TipoCobrancaAction,
} from "./cobrancasAlvos.js";
import { loadContratosDb } from "./contratosDb.js";
import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { loadClienteDespesasDb } from "./clienteDespesasDb.js";
import {
  filtrarVencimentosAposDataInicioJuros,
  filtrarVencimentosCalculoSemanal,
  filtrarVencimentosSemanalCobranca,
  inferirDiaEscalonamento,
  montarPacoteCobrancaSemanalAtraso,
  resolverDiaEscalonamentoSemanal,
  type ResumoCobrancaSemanal,
} from "./pagamentoSemanalCobranca.js";
import { compactPlaca } from "./placa.js";

export type LoteCobrancaItem = {
  alvo: AlvoCobranca;
  resultados: ResultadoCobranca[];
  semanalAtraso?: SemanalAtrasoPacote;
  diaEscalonamento?: number | null;
  arquivos: string[];
  aviso?: string;
};

export type LoteCobrancaResult = {
  tipo: TipoCobrancaAction;
  items: LoteCobrancaItem[];
  resumo: { alvos: number; mensagens: number; ignorados: number };
};

function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

function dataArquivo(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function slug(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function contratoAtivoPlaca(placa: string, clienteId?: string | null) {
  const p = compactPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) => c.status === "ativo" && compactPlaca(c.placa ?? "") === p,
  );
  if (clienteId) {
    const par = list.find((c) => c.clienteId === clienteId);
    if (par) return par;
  }
  list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return list[0] ?? null;
}

function somaValorDespesas(despesas: ClienteDespesaRegistro[]): number {
  return despesas.reduce((s, d) => s + (Number(d.valorMulta) || 0), 0);
}

function tipoCobrancaWhatsApp(tipo: TipoCobrancaAction): TipoCobranca {
  const map: Record<TipoCobrancaAction, TipoCobranca> = {
    "pagamento-semanal": "semanal",
    renegociacao: "renegociacao",
    infracoes: "multa",
    pedagio: "pedagio",
    "estacionamento-rotativo": "estacionamento",
    manutencao: "manutencao",
  };
  return map[tipo];
}

function gerarWhatsAppAlvo(
  alvo: AlvoCobranca,
  opts?: { dia?: number; nome?: string; valor?: number },
): ResultadoCobranca[] {
  const nome = opts?.nome ?? alvo.clienteNome ?? undefined;
  switch (alvo.tipo) {
    case "pagamento-semanal": {
      const dia = opts?.dia;
      if (dia == null) {
        throw new Error("Dia de escalonamento não informado para pagamento semanal.");
      }
      return [gerarSemanal(alvo.placa, dia, { nome, valor: opts?.valor })];
    }
    case "renegociacao":
      return [
        gerarRenegociacao(alvo.placa, somaValorDespesas(alvo.despesas), { nome }),
      ];
    case "infracoes":
      return gerarMultas(alvo.placa, {
        nome,
        autos: alvo.despesas.map((d) => d.autoInfracao),
      });
    case "pedagio":
      return [gerarPedagio(alvo.placa, { nome })];
    case "estacionamento-rotativo":
      return [gerarEstacionamento(alvo.placa, { nome })];
    case "manutencao":
      return [
        gerarManutencao(alvo.placa, somaValorDespesas(alvo.despesas), { nome }),
      ];
  }
}

export type SemanalAtrasoPacote = {
  markdown: string;
  payload: Record<string, unknown>;
  totalGeral: number;
  resumo?: ResumoCobrancaSemanal;
};

function despesasSemanalEscopo(alvo: AlvoCobranca): ClienteDespesaRegistro[] {
  const db = loadClienteDespesasDb();
  const placaKey = compactPlaca(alvo.placa);
  return db.clienteDespesas.filter(
    (d) =>
      d.categoria === "Locação semanal" &&
      compactPlaca(d.veiculoId) === placaKey &&
      (!alvo.clienteId || d.condutorId === alvo.clienteId),
  );
}

function buildSemanalAtrasoAlvo(
  alvo: AlvoCobranca,
  dataPagamentoBr: string,
  diaEscalonamento?: number,
): SemanalAtrasoPacote | null {
  const contrato = contratoAtivoPlaca(alvo.placa, alvo.clienteId);
  const valorSemanal = contrato?.valorSemanal ?? null;
  const valorDiaria = contrato?.valorDiaria ?? null;
  const dataInicioJurosMultaBr = contrato?.dataInicioJurosMultaBr ?? null;
  const vencimentos = filtrarVencimentosAposDataInicioJuros(
    filtrarVencimentosCalculoSemanal(alvo.vencimentosBr ?? [], dataPagamentoBr, true),
    dataInicioJurosMultaBr,
  );

  if (valorSemanal == null || valorDiaria == null || vencimentos.length === 0) {
    return null;
  }

  const pacote = montarPacoteCobrancaSemanalAtraso({
    valorSemanal,
    valorDiaria,
    vencimentosBr: alvo.vencimentosBr ?? [],
    dataPagamentoBr,
    emAberto: true,
    diaEscalonamento,
    clienteNome: alvo.clienteNome ?? undefined,
    placa: alvo.placa,
    clienteId: alvo.clienteId,
    dataInicioJurosMultaBr,
    despesasSemanal: despesasSemanalEscopo(alvo),
  });
  if (!pacote) return null;

  return {
    markdown: pacote.markdown,
    payload: pacote.payload,
    totalGeral: pacote.totalGeral,
    resumo: pacote.resumo,
  };
}

/** Monta tabela semanal-atraso a partir de vencimentos (sidecar / escopo único). */
export function buildSemanalAtrasoParaEscopo(
  placa: string,
  clienteId: string | null,
  clienteNome: string | null,
  vencimentosBr: string[],
  dataPagamentoBr: string,
  diaOverride?: number,
  dataInicioJurosMultaBr?: string | null,
  despesas?: ClienteDespesaRegistro[],
): SemanalAtrasoPacote | null {
  const contrato = contratoAtivoPlaca(placa, clienteId);
  const dataInicio =
    dataInicioJurosMultaBr ?? contrato?.dataInicioJurosMultaBr ?? null;
  const vencJuros = filtrarVencimentosAposDataInicioJuros(vencimentosBr, dataInicio);
  if (vencJuros.length === 0) return null;
  const dia = resolverDiaEscalonamentoSemanal(
    vencJuros,
    dataPagamentoBr,
    diaOverride,
  );
  return buildSemanalAtrasoAlvo(
    {
      tipo: "pagamento-semanal",
      placa,
      clienteId,
      clienteNome,
      despesas: despesas ?? [],
      vencimentosBr,
    },
    dataPagamentoBr,
    dia ?? undefined,
  );
}

/** Lista alvos sem gerar arquivos. */
export function listarResumoAlvos(
  tipo: TipoCobrancaAction,
  filtro?: FiltroAlvosCobranca,
): AlvoCobranca[] {
  return listarAlvosCobranca(tipo, filtro);
}

/** Gera cobranças para todos os alvos elegíveis do tipo. */
export function executarLoteCobranca(
  tipo: TipoCobrancaAction,
  opts?: {
    filtro?: FiltroAlvosCobranca;
    /** Sobrescreve inferência automática (D+1 lembrete · D+2 aviso · D+3 bloqueio). */
    diaOverride?: number;
    dataPagamentoBr?: string;
    salvar?: boolean;
    outDir?: string;
  },
): LoteCobrancaResult {
  const alvos = listarAlvosCobranca(tipo, opts?.filtro);
  const salvar = opts?.salvar !== false;
  const outDir = opts?.outDir ?? COBRANCAS_OUT_DIR;
  const dataPagamentoBr = opts?.dataPagamentoBr ?? hojeBr();
  const items: LoteCobrancaItem[] = [];
  let mensagens = 0;
  let ignorados = 0;

  for (const alvo of alvos) {
    const item: LoteCobrancaItem = {
      alvo,
      resultados: [],
      arquivos: [],
    };

    if (tipo === "pagamento-semanal") {
      const contrato = contratoAtivoPlaca(alvo.placa, alvo.clienteId);
      const dataInicioJurosMultaBr = contrato?.dataInicioJurosMultaBr ?? null;
      const vencimentosBr = alvo.vencimentosBr ?? [];
      const vencimentosJuros = filtrarVencimentosAposDataInicioJuros(
        vencimentosBr,
        dataInicioJurosMultaBr,
      );
      const vencimentosWhatsApp = filtrarVencimentosSemanalCobranca(
        vencimentosJuros,
        dataPagamentoBr,
      );
      const vencimentosExibicao = filtrarVencimentosCalculoSemanal(
        vencimentosJuros,
        dataPagamentoBr,
        true,
      );
      const dia = resolverDiaEscalonamentoSemanal(
        vencimentosWhatsApp,
        dataPagamentoBr,
        opts?.diaOverride,
      );
      item.diaEscalonamento = dia;

      const semanal = buildSemanalAtrasoAlvo(alvo, dataPagamentoBr, dia ?? undefined);
      if (!semanal) {
        if (
          contrato?.valorSemanal == null ||
          contrato?.valorDiaria == null
        ) {
          item.aviso =
            "Contrato ativo ou valores semanal/diária não encontrados — sem tabela de atraso.";
        } else if (vencimentosExibicao.length === 0) {
          if (
            dataInicioJurosMultaBr &&
            filtrarVencimentosCalculoSemanal(vencimentosBr, dataPagamentoBr, true).length > 0
          ) {
            item.aviso =
              `Parcelas anteriores a ${dataInicioJurosMultaBr} sem juros/bloqueio (acordo) — sem tabela de atraso elegível.`;
          } else {
            item.aviso =
              "Nenhuma parcela semanal em aberto elegível — sem tabela de atraso.";
          }
        } else {
          item.aviso = "Sem tabela de atraso.";
        }
        ignorados++;
      } else {
        item.semanalAtraso = semanal;
        if (dataInicioJurosMultaBr) {
          const excluidos = filtrarVencimentosCalculoSemanal(
            vencimentosBr,
            dataPagamentoBr,
            true,
          ).filter(
            (v) =>
              !filtrarVencimentosAposDataInicioJuros([v], dataInicioJurosMultaBr).length,
          );
          if (excluidos.length > 0) {
            item.aviso =
              `Acordo: vencimentos ${excluidos.join(", ")} sem juros/bloqueio (anteriores a ${dataInicioJurosMultaBr}).`;
          }
        }
        if (dia == null) {
          const venc = vencimentosExibicao[0] ?? vencimentosBr[0] ?? "?";
          item.aviso = `Ainda no prazo de pagamento (vencimento ${venc}) — sem mensagem WhatsApp.`;
        }
      }
    }

    try {
      if (tipo === "pagamento-semanal") {
        if (item.diaEscalonamento == null) {
          item.resultados = [];
        } else {
          item.resultados = gerarWhatsAppAlvo(alvo, {
            dia: item.diaEscalonamento,
            valor: item.semanalAtraso?.resumo?.totalReceber,
          });
          mensagens += item.resultados.length;
        }
      } else {
        item.resultados = gerarWhatsAppAlvo(alvo);
        mensagens += item.resultados.length;
      }
    } catch (e) {
      item.aviso = e instanceof Error ? e.message : String(e);
      ignorados++;
      items.push(item);
      continue;
    }

    if (salvar) {
      fs.mkdirSync(outDir, { recursive: true });
      for (const r of item.resultados) {
        item.arquivos.push(salvarCobranca(r, outDir));
      }

      if (item.semanalAtraso) {
        const slugNome = slug(alvo.clienteNome ?? alvo.placa);
        const dataArq = dataPagamentoBr.replace(/\//g, "-");
        const mdPath = path.join(
          outDir,
          `semanal-atraso-${slugNome}-${dataArq}.md`,
        );
        const jsonPath = path.join(
          outDir,
          `dados-semanal-atraso-${slugNome}-${dataArq}.json`,
        );
        fs.writeFileSync(mdPath, item.semanalAtraso.markdown, "utf8");
        fs.writeFileSync(
          jsonPath,
          JSON.stringify(item.semanalAtraso.payload, null, 2),
          "utf8",
        );
        item.arquivos.push(mdPath, jsonPath);
      }
    }

    items.push(item);
  }

  return {
    tipo,
    items,
    resumo: { alvos: alvos.length, mensagens, ignorados },
  };
}

export function salvarLoteConsolidado(
  result: LoteCobrancaResult,
  outDir?: string,
): string {
  const dir = outDir ?? COBRANCAS_OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    tipo: result.tipo,
    tipoWhatsApp: tipoCobrancaWhatsApp(result.tipo),
    geradoEm: new Date().toISOString(),
    resumo: result.resumo,
    alvos: result.items.map((item) => ({
      placa: item.alvo.placa,
      clienteId: item.alvo.clienteId,
      clienteNome: item.alvo.clienteNome,
      despesas: item.alvo.despesas.length,
      aviso: item.aviso ?? null,
      totalGeralSemanal: item.semanalAtraso?.resumo?.totalReceber ?? item.semanalAtraso?.totalGeral ?? null,
      diaEscalonamento: item.diaEscalonamento ?? null,
      resumoSemanal: item.semanalAtraso?.resumo ?? null,
      arquivos: item.arquivos,
      cobrancas: item.resultados.map((r) => ({
        titulo: r.titulo,
        nomeArquivo: r.nomeArquivo,
        texto: r.texto,
        ...r.dados,
      })),
    })),
  };
  const saida = path.join(
    dir,
    `dados-lote-${result.tipo}-${dataArquivo()}.json`,
  );
  fs.writeFileSync(saida, JSON.stringify(payload, null, 2), "utf8");
  return saida;
}
