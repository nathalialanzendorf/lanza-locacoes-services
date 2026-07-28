import { queryResumoCountsFromSql, useRelationalStore, type ResumoCounts } from "@lanza/db";
import {
  isClienteAtivo,
  isVeiculoAtivo,
  loadClientesDb,
  loadContratosDb,
  loadInfracoesDb,
  loadVeiculosDb,
  type ClienteRegistro,
  type ContratoRegistro,
  type InfracaoRegistro,
  type VeiculoRegistro,
  contratoAtivoOperacional,
  contratoVinculadoVeiculo,
  listarContratosVencimentoDashboard,
} from "../lib-imports.js";

function infracaoEmAberto(i: {
  quitadaDetran?: boolean;
  situacao?: string | null;
  status?: string | null;
}): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

function infracaoNotificada(i: {
  convertidaEmDebito?: boolean;
  dataVencimentoOriginal?: string | null;
}): boolean {
  if (i.convertidaEmDebito === true) return false;
  return !String(i.dataVencimentoOriginal ?? "").trim();
}

function infracaoEmAbertoDebito(i: {
  convertidaEmDebito?: boolean;
  dataVencimentoOriginal?: string | null;
}): boolean {
  if (i.convertidaEmDebito === true) return true;
  return !!String(i.dataVencimentoOriginal ?? "").trim();
}

function infracaoSemResponsavel(i: { condutorId?: string | null }): boolean {
  return !Boolean(String(i.condutorId ?? "").trim());
}

function montarResumoFromStores(
  clientes: ClienteRegistro[],
  veiculos: VeiculoRegistro[],
  contratos: ContratoRegistro[],
  infracoes: InfracaoRegistro[],
): ResumoCounts {
  const clientesAtivos = clientes.filter(isClienteAtivo);
  const veiculosAtivos = veiculos.filter(isVeiculoAtivo);
  const contratosAtivos = contratos.filter((c) => contratoAtivoOperacional(c));
  const veiculoTemContratoAtivo = (v: VeiculoRegistro) =>
    contratosAtivos.some((c) => contratoVinculadoVeiculo(c, v));
  const veiculosLocados = veiculosAtivos.filter(veiculoTemContratoAtivo);

  const infracoesAbertas = infracoes.filter((i) => i.ativo !== false && infracaoEmAberto(i));
  const infracoesNotificadas = infracoesAbertas.filter(infracaoNotificada);
  const infracoesEmAbertoDebito = infracoesAbertas.filter(infracaoEmAbertoDebito);
  const infracoesSemResponsavel = infracoesAbertas.filter(infracaoSemResponsavel);
  const vencimento = listarContratosVencimentoDashboard(contratos);

  return {
    clientes: { total: clientes.length, ativos: clientesAtivos.length },
    veiculos: {
      total: veiculos.length,
      ativos: veiculosAtivos.length,
      locados: veiculosLocados.length,
      naoLocados: veiculosAtivos.length - veiculosLocados.length,
    },
    contratos: {
      total: contratos.length,
      ativos: contratosAtivos.length,
      vencidos: vencimento.vencidos.length,
      aVencer: vencimento.aVencer.length,
    },
    infracoes: {
      emAberto: infracoesAbertas.length,
      notificadas: infracoesNotificadas.length,
      emAbertoDebito: infracoesEmAbertoDebito.length,
      semResponsavel: infracoesSemResponsavel.length,
      comVencimento: infracoesEmAbertoDebito.length,
      semCliente: infracoesSemResponsavel.length,
      semCondutor: infracoesSemResponsavel.length,
    },
  };
}

/** Contagens dos widgets — Postgres usa SQL agregado; JSON local mantém filtro em memória. */
export function obterResumo(): ResumoCounts {
  return montarResumoFromStores(
    loadClientesDb().clientes,
    loadVeiculosDb().veiculos,
    loadContratosDb().contratos,
    loadInfracoesDb().infracoes,
  );
}

let resumoCache: { at: number; data: ResumoCounts } | null = null;
const RESUMO_CACHE_MS = 20_000;

const RESUMO_VAZIO: ResumoCounts = {
  clientes: { total: 0, ativos: 0 },
  veiculos: { total: 0, ativos: 0, locados: 0, naoLocados: 0 },
  contratos: { total: 0, ativos: 0, vencidos: 0, aVencer: 0 },
  infracoes: {
    emAberto: 0,
    notificadas: 0,
    emAbertoDebito: 0,
    semResponsavel: 0,
    comVencimento: 0,
    semCliente: 0,
    semCondutor: 0,
  },
};

export async function obterResumoAsync(): Promise<ResumoCounts> {
  if (process.env.VERCEL && resumoCache && Date.now() - resumoCache.at < RESUMO_CACHE_MS) {
    return resumoCache.data;
  }

  try {
    const data = (await useRelationalStore())
      ? await queryResumoCountsFromSql()
      : obterResumo();

    if (process.env.VERCEL) resumoCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[resumo] falha ao calcular contagens:", err);
    return RESUMO_VAZIO;
  }
}
