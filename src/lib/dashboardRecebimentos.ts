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
import type { ContratoRegistro } from "./contratosDb.js";
import {
  contratoMaisRecentePar,
  contratoVinculadoVeiculo,
} from "./contratosDb.js";
import { compararDataBrAsc } from "./contratoExtrair.js";
import { diaPagamentoParaDow } from "./caucaoParcelas.js";
import { hojeBr, hojeDowBr, nomeDiaSemanaBr, parseDataBrOuIsoDia } from "./dataBr.js";
import {
  isJurosMultaSemanalDescricao,
  vencimentoDespesaSemanalBr,
} from "./pagamentoSemanal.js";
import { vencimentoSemanalElegivelCobrancaSafe } from "./pagamentoSemanalCobranca.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { formatVeiculoLabel } from "./veiculoLabel.js";
import { findVeiculoInDb, placaHyphenVeiculoRef, veiculoRefAtivo, type VeiculoRegistro } from "./veiculosDb.js";
import { StatusContrato, CategoriaDespesaCliente, TipoCobrancaAction } from "./domain/index.js";

export type DashboardRecebimentoLinha = {
  clienteId: string | null;
  clienteNome: string | null;
  placa: string;
  /** Placa + marca/modelo para exibição no dashboard. */
  veiculo: string;
  /** uuid em cliente-despesas.json — uma linha por despesa. */
  despesaId?: string | null;
  descricao?: string | null;
  valor: number;
  vencimentoBr?: string | null;
  vencimentosBr?: string[];
  diasAtraso?: number | null;
};

export type DashboardRecebimentosTotais = {
  semanal: number;
  caucao: number;
  renegociacao: number;
};

/** @deprecated use DashboardRecebimentos */
export type DashboardRecebimentosTotaisResponse = {
  dataReferenciaBr: string;
  tituloPagamentoSemanal: string;
  totais: DashboardRecebimentosTotais;
};

/** @deprecated listagem via GET /api/despesas no dashboard */
export type DashboardRecebimentosListaResponse = {
  dataReferenciaBr: string;
  tituloPagamentoSemanal?: string;
  items: DashboardRecebimentoLinha[];
};

export type DashboardRecebimentos = {
  dataReferenciaBr: string;
  /** Ex.: Pagamento semanal (SÁBADO) */
  tituloPagamentoSemanal: string;
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

function placaDoVeiculoRef(veiculoRef: string, veiculos: VeiculoRegistro[]): string {
  return placaHyphenVeiculoRef(veiculoRef, veiculos);
}

function veiculoAtivo(veiculoRef: string, veiculos: VeiculoRegistro[]): boolean {
  return veiculoRefAtivo(veiculoRef, veiculos);
}

function clienteAtivo(clienteId: string | null | undefined, clientes: ClienteRegistro[]): boolean {
  if (!clienteId) return false;
  const c = clientes.find((x) => x.id === clienteId);
  return c != null && c.ativo !== false;
}

function contratoAtivoVeiculoRef(
  veiculoRef: string,
  contratos: ContratoRegistro[],
  veiculos: VeiculoRegistro[],
  clienteId?: string | null,
): ContratoRegistro | null {
  const placa = placaDoVeiculoRef(veiculoRef, veiculos);
  const veiculo = findVeiculoInDb({ veiculos }, veiculoRef);
  const veiculoId = veiculo?.id?.trim() || null;

  if (clienteId) {
    const par = contratoMaisRecentePar(
      { placa, veiculoId, clienteId },
      contratos,
      veiculos,
    );
    if (par?.status === StatusContrato.Ativo) return par;
  }

  const ativos = contratos.filter(
    (c) =>
      c.status === StatusContrato.Ativo &&
      contratoVinculadoVeiculo(c, veiculo ?? { id: veiculoId ?? veiculoRef, placa }),
  );
  if (clienteId) {
    const par = ativos.find((c) => c.clienteId === clienteId);
    if (par) return par;
  }
  ativos.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return ativos[0] ?? null;
}

function clienteIdEfetivoDespesa(
  d: ClienteDespesaRegistro,
  ctx: CobrancasDbContext,
): string | null {
  if (d.condutorId && clienteAtivo(d.condutorId, ctx.clientes)) {
    return d.condutorId;
  }
  const contrato = contratoAtivoVeiculoRef(d.veiculoId, ctx.contratos, ctx.veiculos);
  if (contrato?.clienteId && clienteAtivo(contrato.clienteId, ctx.clientes)) {
    return contrato.clienteId;
  }
  return d.condutorId ?? null;
}

function despesaElegivelTotaisDashboard(
  d: ClienteDespesaRegistro,
  ctx: CobrancasDbContext,
): boolean {
  if (!despesaAberta(d)) return false;
  if (!veiculoAtivo(d.veiculoId, ctx.veiculos)) return false;
  const clienteId = clienteIdEfetivoDespesa(d, ctx);
  return Boolean(clienteId && clienteAtivo(clienteId, ctx.clientes));
}

function chaveClientePlaca(clienteId: string | null, placa: string): string {
  return `${clienteId ?? ""}|${compactPlaca(placa)}`;
}

function diasAtrasoDeVencimento(vencBr: string, hoje: string): number | null {
  if (!vencimentoSemanalElegivelCobrancaSafe(vencBr, hoje)) return null;
  const venc = parseDataBrOuIsoDia(vencBr);
  const ref = parseDataBrOuIsoDia(hoje);
  if (!venc || !ref) return null;
  const dias = Math.round((ref.getTime() - venc.getTime()) / 86_400_000);
  return dias > 0 ? dias : null;
}

function despesaParaLinhaDashboard(
  d: ClienteDespesaRegistro,
  ctx: CobrancasDbContext,
  base: {
    clienteId: string | null;
    clienteNome: string | null;
    placa: string;
    valor?: number;
  },
  hoje: string,
): DashboardRecebimentoLinha | null {
  const venc = vencimentoDespesaSemanalBr(
    d.descricao ?? "",
    d.rastreameDataIso,
    d.dataAutuacao,
  );
  if (!venc) return null;

  const valor =
    base.valor != null ? base.valor : round2(Number(d.valorMulta) || 0);

  return linhaRecebimento(
    {
      despesaId: d.id,
      descricao: String(d.descricao ?? d.categoria ?? "").trim() || null,
      clienteId: base.clienteId,
      clienteNome: base.clienteNome,
      placa: base.placa,
      valor,
      vencimentoBr: venc,
      diasAtraso: diasAtrasoDeVencimento(venc, hoje),
    },
    ctx.veiculos,
  );
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
  const pa = a.placa.localeCompare(b.placa, "pt-BR");
  if (pa !== 0) return pa;
  return (a.descricao ?? "").localeCompare(b.descricao ?? "", "pt-BR");
}

/** Em atraso: cliente → vencimento mais antigo → placa → descrição. */
function ordenarLinhasAtraso(a: DashboardRecebimentoLinha, b: DashboardRecebimentoLinha): number {
  const na = (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "", "pt-BR");
  if (na !== 0) return na;
  const venc = compararDataBrAsc(a.vencimentoBr ?? "", b.vencimentoBr ?? "");
  if (venc !== 0) return venc;
  const pa = a.placa.localeCompare(b.placa, "pt-BR");
  if (pa !== 0) return pa;
  return (a.descricao ?? "").localeCompare(b.descricao ?? "", "pt-BR");
}

function listarVenceHoje(hoje: string, ctx: CobrancasDbContext): DashboardRecebimentoLinha[] {
  const linhas: DashboardRecebimentoLinha[] = [];
  const chavesComDespesa = new Set<string>();

  for (const d of ctx.clienteDespesas) {
    if (!despesaAberta(d)) continue;
    if (d.categoria !== CategoriaDespesaCliente.LocacaoSemanal) continue;
    if (isJurosMultaSemanalDescricao(d.descricao ?? "")) continue;
    if (!veiculoAtivo(d.veiculoId, ctx.veiculos)) continue;

    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );
    if (!venc || venc !== hoje) continue;
    if (vencimentoSemanalElegivelCobrancaSafe(venc, hoje)) continue;

    const placa = placaDoVeiculoRef(d.veiculoId, ctx.veiculos);
    const contrato = contratoAtivoVeiculoRef(d.veiculoId, ctx.contratos, ctx.veiculos, d.condutorId);
    const clienteId = contrato?.clienteId ?? d.condutorId ?? null;
    if (!clienteAtivo(clienteId, ctx.clientes)) continue;

    const nomeCliente =
      contrato?.clienteNome ??
      ctx.clientes.find((c) => c.id === clienteId)?.nome ??
      null;

    const linha = despesaParaLinhaDashboard(
      d,
      ctx,
      {
        clienteId,
        clienteNome: nomeCliente,
        placa,
        valor: round2(contrato?.valorSemanal ?? (Number(d.valorMulta) || 0)),
      },
      hoje,
    );
    if (!linha) continue;
    linhas.push(linha);
    chavesComDespesa.add(chaveClientePlaca(clienteId, placa));
  }

  const hojeDow = hojeDowBr();
  for (const escopo of listarEscoposContratosAtivosCobranca(ctx)) {
    if (!escopo.placa || !escopo.clienteId) continue;
    const contrato = contratoMaisRecentePar(
      { placa: escopo.placa, clienteId: escopo.clienteId },
      ctx.contratos,
      ctx.veiculos,
    );
    if (contrato?.status !== StatusContrato.Ativo) continue;
    if (!contrato?.diaPagamentoSemana || contrato.valorSemanal == null) continue;
    if (diaPagamentoParaDow(contrato.diaPagamentoSemana) !== hojeDow) continue;

    const chave = chaveClientePlaca(escopo.clienteId, escopo.placa);
    if (chavesComDespesa.has(chave)) continue;

    linhas.push(
      linhaRecebimento(
        {
          descricao: `Pagamento semanal (${contrato.diaPagamentoSemana})`,
          clienteId: escopo.clienteId,
          clienteNome: contrato.clienteNome ?? null,
          placa: formatPlacaHyphen(escopo.placa),
          valor: round2(contrato.valorSemanal),
          vencimentoBr: hoje,
        },
        ctx.veiculos,
      ),
    );
  }

  return linhas.sort(ordenarLinhas);
}

function listarAtrasados(hoje: string, ctx: CobrancasDbContext): DashboardRecebimentoLinha[] {
  const alvos = listarAlvosCobranca(TipoCobrancaAction.PagamentoSemanal, undefined, ctx);
  const linhas: DashboardRecebimentoLinha[] = [];
  const vistos = new Set<string>();

  for (const alvo of alvos) {
    for (const d of alvo.despesas) {
      if (!despesaAberta(d)) continue;
      const venc = vencimentoDespesaSemanalBr(
        d.descricao ?? "",
        d.rastreameDataIso,
        d.dataAutuacao,
      );
      if (!venc || !vencimentoSemanalElegivelCobrancaSafe(venc, hoje)) continue;
      if (vistos.has(d.id)) continue;
      vistos.add(d.id);

      const linha = despesaParaLinhaDashboard(
        d,
        ctx,
        {
          clienteId: alvo.clienteId,
          clienteNome: alvo.clienteNome,
          placa: alvo.placa,
        },
        hoje,
      );
      if (linha) linhas.push(linha);
    }
  }

  return linhas.sort(ordenarLinhasAtraso);
}

function somaCategoria(categoria: string, ctx: CobrancasDbContext): number {
  return round2(
    ctx.clienteDespesas
      .filter(
        (d) =>
          despesaElegivelTotaisDashboard(d, ctx) &&
          (d.categoria ?? "") === categoria,
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

function totalSemanalAberto(ctx: CobrancasDbContext): number {
  return round2(
    ctx.clienteDespesas
      .filter(
        (d) =>
          despesaElegivelTotaisDashboard(d, ctx) &&
          d.categoria === CategoriaDespesaCliente.LocacaoSemanal &&
          !isJurosMultaSemanalDescricao(d.descricao ?? ""),
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

export type DashboardRecebimentosMeta = {
  dataReferenciaBr: string;
  tituloPagamentoSemanal: string;
};

function dashboardMeta(): DashboardRecebimentosMeta {
  return {
    dataReferenciaBr: hojeBr(),
    tituloPagamentoSemanal: `Pagamento semanal (${nomeDiaSemanaBr()})`,
  };
}

export function listarDashboardRecebimentosVenceHoje(
  ctx?: CobrancasDbContext,
): DashboardRecebimentoLinha[] {
  const db = ctx ?? loadCobrancasDbContextSync();
  return listarVenceHoje(hojeBr(), db);
}

export function listarDashboardRecebimentosAtrasados(
  ctx?: CobrancasDbContext,
): DashboardRecebimentoLinha[] {
  const db = ctx ?? loadCobrancasDbContextSync();
  return listarAtrasados(hojeBr(), db);
}

export function obterDashboardRecebimentosTotais(
  ctx?: CobrancasDbContext,
): DashboardRecebimentosTotaisResponse {
  const db = ctx ?? loadCobrancasDbContextSync();
  const meta = dashboardMeta();
  return {
    ...meta,
    totais: totaisRecebimentosDashboard(db),
  };
}

function totaisRecebimentosDashboard(ctx: CobrancasDbContext): DashboardRecebimentosTotais {
  return {
    semanal: totalSemanalAberto(ctx),
    caucao: somaCategoria(CategoriaDespesaCliente.Caucao, ctx),
    renegociacao: somaCategoria(CategoriaDespesaCliente.Renegociacao, ctx),
  };
}

export function obterDashboardRecebimentos(ctx?: CobrancasDbContext): DashboardRecebimentos {
  const db = ctx ?? loadCobrancasDbContextSync();
  const meta = dashboardMeta();
  return {
    ...meta,
    totais: totaisRecebimentosDashboard(db),
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
  return despesaElegivelTotaisDashboard(d, ctx);
}
