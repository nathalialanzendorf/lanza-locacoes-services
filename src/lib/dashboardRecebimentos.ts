/**
 * Métricas de recebimentos para o dashboard — reutiliza regras de cobrança semanal.
 */
import {
  isClienteDespesaAtiva,
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { loadClientesDb } from "./clientesDb.js";
import { loadContratosDb, type ContratoRegistro } from "./contratosDb.js";
import {
  listarAlvosCobranca,
  listarEscoposContratosAtivosCobranca,
} from "./cobrancasAlvos.js";
import { buildSemanalAtrasoParaEscopo } from "./cobrancasLote.js";
import { diaPagamentoParaDow } from "./caucaoParcelas.js";
import {
  isJurosMultaSemanalDescricao,
  vencimentoDespesaSemanalBr,
} from "./pagamentoSemanal.js";
import {
  vencimentoSemanalElegivelCobranca,
} from "./pagamentoSemanalCobranca.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { loadVeiculosDb } from "./veiculosDb.js";

export type DashboardRecebimentoLinha = {
  clienteId: string | null;
  clienteNome: string | null;
  placa: string;
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
  venceHoje: DashboardRecebimentoLinha[];
  atrasados: DashboardRecebimentoLinha[];
  totais: DashboardRecebimentosTotais;
};

function hojeBr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

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

function veiculoAtivo(placa: string): boolean {
  const p = compactPlaca(placa);
  for (const v of loadVeiculosDb().veiculos) {
    if (compactPlaca(v.placa) !== p) continue;
    if (v.ativo === false || v.particular === true) return false;
    return true;
  }
  return false;
}

function clienteAtivo(clienteId: string | null | undefined): boolean {
  if (!clienteId) return false;
  const c = loadClientesDb().clientes.find((x) => x.id === clienteId);
  return c != null && c.ativo !== false;
}

function contratoAtivoPlaca(placa: string, clienteId?: string | null): ContratoRegistro | null {
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

function chaveClientePlaca(clienteId: string | null, placa: string): string {
  return `${clienteId ?? ""}|${compactPlaca(placa)}`;
}

function ordenarLinhas(a: DashboardRecebimentoLinha, b: DashboardRecebimentoLinha): number {
  const na = (a.clienteNome ?? "").localeCompare(b.clienteNome ?? "", "pt-BR");
  if (na !== 0) return na;
  return a.placa.localeCompare(b.placa, "pt-BR");
}

function listarVenceHoje(hoje: string): DashboardRecebimentoLinha[] {
  const porChave = new Map<string, DashboardRecebimentoLinha>();
  const db = loadClienteDespesasDb();

  for (const d of db.clienteDespesas) {
    if (!despesaAberta(d)) continue;
    if (d.categoria !== "Locação semanal") continue;
    if (isJurosMultaSemanalDescricao(d.descricao ?? "")) continue;
    if (!veiculoAtivo(d.veiculoId)) continue;

    const venc = vencimentoDespesaSemanalBr(
      d.descricao ?? "",
      d.rastreameDataIso,
      d.dataAutuacao,
    );
    if (!venc || venc !== hoje) continue;
    if (vencimentoSemanalElegivelCobranca(venc, hoje)) continue;

    const placa = formatPlacaHyphen(d.veiculoId);
    const contrato = contratoAtivoPlaca(placa, d.condutorId);
    const clienteId = contrato?.clienteId ?? d.condutorId ?? null;
    if (!clienteAtivo(clienteId)) continue;

    const chave = chaveClientePlaca(clienteId, placa);
    const valor = contrato?.valorSemanal ?? (Number(d.valorMulta) || 0);
    const nomeCliente =
      contrato?.clienteNome ??
      loadClientesDb().clientes.find((c) => c.id === clienteId)?.nome ??
      null;
    const existente = porChave.get(chave);
    if (existente) {
      existente.valor = Math.max(existente.valor, valor);
      continue;
    }

    porChave.set(chave, {
      clienteId,
      clienteNome: nomeCliente,
      placa,
      valor: round2(valor),
      vencimentoBr: venc,
    });
  }

  const hojeDow = new Date().getDay();
  for (const escopo of listarEscoposContratosAtivosCobranca()) {
    if (!escopo.placa || !escopo.clienteId) continue;
    const contrato = contratoAtivoPlaca(escopo.placa, escopo.clienteId);
    if (!contrato?.diaPagamentoSemana || contrato.valorSemanal == null) continue;
    if (diaPagamentoParaDow(contrato.diaPagamentoSemana) !== hojeDow) continue;

    const chave = chaveClientePlaca(escopo.clienteId, escopo.placa);
    if (porChave.has(chave)) continue;

    porChave.set(chave, {
      clienteId: escopo.clienteId,
      clienteNome: contrato.clienteNome ?? null,
      placa: formatPlacaHyphen(escopo.placa),
      valor: round2(contrato.valorSemanal),
      vencimentoBr: hoje,
    });
  }

  return [...porChave.values()].sort(ordenarLinhas);
}

function listarAtrasados(hoje: string): DashboardRecebimentoLinha[] {
  const alvos = listarAlvosCobranca("pagamento-semanal");
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

    linhas.push({
      clienteId: alvo.clienteId,
      clienteNome: alvo.clienteNome,
      placa: alvo.placa,
      valor: round2(pacote.totalGeral),
      vencimentosBr: alvo.vencimentosBr,
      diasAtraso: pacote.resumo?.diasAtrasados ?? null,
    });
  }

  return linhas.sort(ordenarLinhas);
}

function somaCategoria(categoria: string): number {
  const db = loadClienteDespesasDb();
  return round2(
    db.clienteDespesas
      .filter(
        (d) =>
          despesaAberta(d) &&
          (d.categoria ?? "") === categoria &&
          veiculoAtivo(d.veiculoId) &&
          clienteAtivo(d.condutorId),
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

function totalSemanalAberto(): number {
  const db = loadClienteDespesasDb();
  return round2(
    db.clienteDespesas
      .filter(
        (d) =>
          despesaAberta(d) &&
          d.categoria === "Locação semanal" &&
          !isJurosMultaSemanalDescricao(d.descricao ?? "") &&
          veiculoAtivo(d.veiculoId) &&
          clienteAtivo(d.condutorId),
      )
      .reduce((s, d) => s + (Number(d.valorMulta) || 0), 0),
  );
}

export function obterDashboardRecebimentos(): DashboardRecebimentos {
  const dataReferenciaBr = hojeBr();
  const venceHoje = listarVenceHoje(dataReferenciaBr);
  const atrasados = listarAtrasados(dataReferenciaBr);

  const totais: DashboardRecebimentosTotais = {
    venceHoje: round2(venceHoje.reduce((s, l) => s + l.valor, 0)),
    atrasado: round2(atrasados.reduce((s, l) => s + l.valor, 0)),
    semanal: totalSemanalAberto(),
    caucao: somaCategoria("Caução"),
    renegociacao: somaCategoria("Renegociação"),
  };

  return {
    dataReferenciaBr,
    venceHoje,
    atrasados,
    totais,
  };
}
