/**
 * Métricas de recebimentos para o dashboard — reutiliza regras de cobrança semanal.
 */
import {
  isClienteDespesaAtiva,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import type { ClienteRegistro } from "./clientesDb.js";
import {
  listarAlvosCobranca,
  listarEscoposContratosAtivosCobranca,
} from "./cobrancasAlvos.js";
import {
  loadCobrancasDbContextAsync,
  loadCobrancasDbContextSync,
  type CobrancasDbContext,
} from "./cobrancasDbContext.js";
import { buildSemanalAtrasoParaEscopo } from "./cobrancasLote.js";
import type { ContratoRegistro } from "./contratosDb.js";
import { diaPagamentoParaDow } from "./caucaoParcelas.js";
import { hojeBr, hojeDowBr, nomeDiaSemanaBr } from "./dataBr.js";
import {
  isJurosMultaSemanalDescricao,
  vencimentoDespesaSemanalBr,
} from "./pagamentoSemanal.js";
import { vencimentoSemanalElegivelCobranca } from "./pagamentoSemanalCobranca.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { formatVeiculoLabel } from "./veiculoLabel.js";
import type { VeiculoRegistro } from "./veiculosDb.js";

export type DashboardRecebimentoLinha = {
  clienteId: string | null;
  clienteNome: string | null;
  placa: string;
  /** Placa + marca/modelo para exibição no dashboard. */
  veiculo: string;
  valor: number;
  vencimentoBr?: string | null;
  vencimentosBr?: string[];
  diasAtraso?: number | null;
};

export type DashboardRecebimentosTotais = {
  venceHoje: number;
  atrasado: number;
  semanal: number;
  caucao: number;
  renegociacao: number;
};

export type DashboardRecebimentos = {
  dataReferenciaBr: string;
  /** Ex.: Pagamento semanal (SÁBADO) */
  tituloPagamentoSemanal: string;
  venceHoje: DashboardRecebimentoLinha[];
  atrasados: DashboardRecebimentoLinha[];
  totais: DashboardRecebimentosTotais;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function despesaAberta(d: ClienteDespesaRegistro): boolean {
  return (
    isClienteDespesaAtiva(d) &&
    d.paga !== true &&
    (d.situacao === "Em aberto" || !d.paga)
  );
}

function veiculoAtivo(placa: string, veiculos: VeiculoRegistro[]): boolean {
  const p = compactPlaca(placa);
  for (const v of veiculos) {
    if (compactPlaca(v.placa) !== p) continue;
    if (v.ativo === false || v.particular === true) return false;
    return true;
  }
  return false;
}

function clienteAtivo(clienteId: string | null | undefined, clientes: ClienteRegistro[]): boolean {
  if (!clienteId) return false;
  const c = clientes.find((x) => x.id === clienteId);
  return c != null && c.ativo !== false;
}

function contratoAtivoPlaca(
  placa: string,
  contratos: ContratoRegistro[],
  clienteId?: string | null,
): ContratoRegistro | null {
  const p = compactPlaca(placa);
  const list = contratos.filter(
    (c) => c.status === "ativo" && compactPlaca(c.placa ?? "") === p,
  );
  if (clienteId) {
    const par = list.find((c) => c.clienteId === clienteId);
    if (par) return par;
  }
  list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return list[0] ?? null;
}

function chaveClientePlaca(clienteId: string | null, placa: string): string {
  return `${clienteId ?? ""}|${compactPlaca(placa)}`;
}

function veiculoLabelPorPlaca(placa: string, veiculos: VeiculoRegistro[]): string {
  const p = compactPlaca(placa);
  const v = veiculos.find((x) => compactPlaca(x.placa) === p);
  return formatVeiculoLabel({
    placa: v?.placa ?? placa,
    marcaModelo: v?.marcaModelo,
    marca: v?.marca,
    modelo: v?.modelo,
    anoModelo: v?.anoModelo,
  });
}

function linhaRecebimento(
  base: Omit<DashboardRecebimentoLinha, "veiculo">,
  veiculos: VeiculoRegistro[],
): DashboardRecebimentoLinha {
  return {
    ...base,
    veiculo: veiculoLabelPorPlaca(base.placa, veiculos),
  };
}

function ordenarLinhas(a: DashboardRecebimentoLinha, b: DashboardRecebimentoLinha): number {
  const na = (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "", "pt-BR");
  if (na !== 0) return na;
  return a.placa.localeCompare(b.placa, "pt-BR");
}

function listarVenceHoje(hoje: string, ctx: CobrancasDbContext): DashboardRecebimentoLinha[] {
  const porChave = new Map<string, DashboardRecebimentoLinha>();

  for (const d of ctx.clienteDespesas) {
    if (!despesaAberta(d)) continue;
    if (d.categoria !== "Locação semanal") continue;
    if (isJurosMultaSemanalDescricao(d.descricao ?? "")) continue;
    if (!veiculoAtivo(d.veiculoId, ctx.veiculos)) continue;

    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );
    if (!venc || venc !== hoje) continue;
    if (vencimentoSemanalElegivelCobranca(venc, hoje)) continue;

    const placa = formatPlacaHyphen(d.veiculoId);
    const contrato = contratoAtivoPlaca(placa, ctx.contratos, d.condutorId);
    const clienteId = contrato?.clienteId ?? d.condutorId ?? null;
    if (!clienteAtivo(clienteId, ctx.clientes)) continue;

    const chave = chaveClientePlaca(clienteId, placa);
    const valor = contrato?.valorSemanal ?? (Number(d.valorMulta) || 0);
    const nomeCliente =
      contrato?.clienteNome ??
      ctx.clientes.find((c) => c.id === clienteId)?.nome ??
      null;
    const existente = porChave.get(chave);
    if (existente) {
      existente.valor = Math.max(existente.valor, valor);
      continue;
    }

    porChave.set(chave, linhaRecebimento({
      clienteId,
      clienteNome: nomeCliente,
      placa,
      valor: round2(valor),
      vencimentoBr: venc,
    }, ctx.veiculos));
  }

  const hojeDow = hojeDowBr();
  for (const escopo of listarEscoposContratosAtivosCobranca(ctx)) {
    if (!escopo.placa || !escopo.clienteId) continue;
    const contrato = contratoAtivoPlaca(escopo.placa, ctx.contratos, escopo.clienteId);
    if (!contrato?.diaPagamentoSemana || contrato.valorSemanal == null) continue;
    if (diaPagamentoParaDow(contrato.diaPagamentoSemana) !== hojeDow) continue;

    const chave = chaveClientePlaca(escopo.clienteId, escopo.placa);
    if (porChave.has(chave)) continue;

    porChave.set(chave, linhaRecebimento({
      clienteId: escopo.clienteId,
      clienteNome: contrato.clienteNome ?? null,
      placa: formatPlacaHyphen(escopo.placa),
      valor: round2(contrato.valorSemanal),
      vencimentoBr: hoje,
    }, ctx.veiculos));
  }

  return [...porChave.values()].sort(ordenarLinhas);
}

function listarAtrasados(hoje: string, ctx: CobrancasDbContext): DashboardRecebimentoLinha[] {
  const alvos = listarAlvosCobranca("pagamento-semanal", undefined, ctx);
  const linhas: DashboardRecebimentoLinha[] = [];

  for (const alvo of alvos) {
    const pacote = buildSemanalAtrasoParaEscopo(
      alvo.placa,
      alvo.clienteId,
      alvo.clienteNome,
      alvo.vencimentosBr ?? [],
      hoje,
    );
    if (!pacote) continue;

    linhas.push(linhaRecebimento({
      clienteId: alvo.clienteId,
      clienteNome: alvo.clienteNome,
      placa: alvo.placa,
      valor: round2(pacote.totalGeral),
      vencimentosBr: alvo.vencimentosBr,
      diasAtraso: pacote.resumo?.diasAtrasados ?? null,
    }, ctx.veiculos));
  }

  return linhas.sort(ordenarLinhas);
}

function somaCategoria(categoria: string, ctx: CobrancasDbContext): number {
  return round2(
    ctx.clienteDespesas
      .filter(
        (d) =>
          despesaAberta(d) &&
          (d.categoria ?? "") === categoria &&
          veiculoAtivo(d.veiculoId, ctx.veiculos) &&
          clienteAtivo(d.condutorId, ctx.clientes),
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

function totalSemanalAberto(ctx: CobrancasDbContext): number {
  return round2(
    ctx.clienteDespesas
      .filter(
        (d) =>
          despesaAberta(d) &&
          d.categoria === "Locação semanal" &&
          !isJurosMultaSemanalDescricao(d.descricao ?? "") &&
          veiculoAtivo(d.veiculoId, ctx.veiculos) &&
          clienteAtivo(d.condutorId, ctx.clientes),
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

export function obterDashboardRecebimentos(ctx?: CobrancasDbContext): DashboardRecebimentos {
  const db = ctx ?? loadCobrancasDbContextSync();
  const dataReferenciaBr = hojeBr();
  const venceHoje = listarVenceHoje(dataReferenciaBr, db);
  const atrasados = listarAtrasados(dataReferenciaBr, db);

  const totais: DashboardRecebimentosTotais = {
    venceHoje: round2(venceHoje.reduce((s, l) => s + l.valor, 0)),
    atrasado: round2(atrasados.reduce((s, l) => s + l.valor, 0)),
    semanal: totalSemanalAberto(db),
    caucao: somaCategoria("Caução", db),
    renegociacao: somaCategoria("Renegociação", db),
  };

  return {
    dataReferenciaBr,
    tituloPagamentoSemanal: `Pagamento semanal (${nomeDiaSemanaBr()})`,
    venceHoje,
    atrasados,
    totais,
  };
}

export async function obterDashboardRecebimentosAsync(): Promise<DashboardRecebimentos> {
  return obterDashboardRecebimentos(await loadCobrancasDbContextAsync());
}

/** Despesa cliente em aberto elegível para totais do dashboard (frota + cliente activos). */
export function despesaClienteAbertaDashboard(
  d: ClienteDespesaRegistro,
  ctx: CobrancasDbContext,
): boolean {
  if (!despesaAberta(d)) return false;
  if (!veiculoAtivo(d.veiculoId, ctx.veiculos)) return false;
  if (d.condutorId && !clienteAtivo(d.condutorId, ctx.clientes)) return false;
  return true;
}
