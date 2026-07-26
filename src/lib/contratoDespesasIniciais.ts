import crypto from "node:crypto";

import {
  gerarDatasParcelasCaucao,
  infoCaucaoEntrada,
  infoParcelaCaucao,
} from "./caucaoParcelas.js";
import {
  gravarClienteDespesa,
  type ClienteDespesaPersistOpts,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import type { ContratoRegistro } from "./contratosDb.js";
import type { GerarContratoDados } from "./docxGerar.js";
import type { MontarContratoDbInput } from "./montarDadosContrato.js";
import {
  infoParcelaPrimeiraSemana,
  montarDescricaoPrimeiraSemanalContrato,
  vencimentoBrToIsoEndDay,
} from "./pagamentoSemanal.js";
import { CategoriaDespesaCliente } from "./domain/categoriaDespesaCliente.js";
import { SituacaoDespesa } from "./domain/situacaoDespesa.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function localAutoInfracao(): string {
  return `LOCAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function contratoTemParcelamento(
  input: MontarContratoDbInput | null,
  dados: GerarContratoDados,
): boolean {
  if (dados.caucaoParcelas || dados.caucaoSemanalParcelado || dados.semanaParcelas) {
    return true;
  }
  if (!input) return false;
  if (input.caucaoParcelas || input.caucaoSemanalParcelado || input.semanaParcelas) {
    return true;
  }
  return (
    input.caucaoParcelasN != null ||
    input.caucaoValorParcela != null ||
    input.caucaoSaldoAberto != null ||
    input.caucaoDatas != null ||
    input.semanaEntrada != null ||
    input.semanaParcelasN != null ||
    input.semanaValorParcela != null
  );
}

type GravarOpts = {
  veiculoId: string | null;
  placa: string;
  clienteId: string | null;
  inicioBr: string;
  pagaEm: string;
  valorSemanal: number;
};

function persistOptsContratoCriar(opts: GravarOpts): ClienteDespesaPersistOpts {
  return {
    syncRastreame: false,
    skipInferir: true,
    skipDupCheck: true,
    skipDupSemanal: true,
    veiculoId: opts.veiculoId ?? undefined,
    valorSemanalContrato: opts.valorSemanal,
  };
}

type DespesaPatch = {
  categoria: string;
  descricao: string;
  dataAutuacao: string;
  valorMulta: number;
};

async function gravarPaga(
  opts: GravarOpts,
  patch: DespesaPatch,
): Promise<{ registro: ClienteDespesaRegistro; proximaParcela: ClienteDespesaRegistro | null }> {
  const veiculoRef = opts.veiculoId ?? opts.placa;
  const r = await gravarClienteDespesa(
    veiculoRef,
    {
      autoInfracao: localAutoInfracao(),
      localInfracao: "",
      situacao: SituacaoDespesa.Pago,
      limiteDefesa: "",
      paga: true,
      pagaEm: opts.pagaEm,
      rastreameDataIso: opts.pagaEm,
      condutorId: opts.clienteId,
      origem: "contrato-criar",
      rastreameTipo: "OUTROS",
      ...patch,
    },
    persistOptsContratoCriar(opts),
  );
  return { registro: r.registro, proximaParcela: r.proximaParcela ?? null };
}

async function gravarAberta(
  opts: GravarOpts,
  patch: DespesaPatch,
): Promise<ClienteDespesaRegistro> {
  const veiculoRef = opts.veiculoId ?? opts.placa;
  const r = await gravarClienteDespesa(
    veiculoRef,
    {
      autoInfracao: localAutoInfracao(),
      localInfracao: "",
      situacao: SituacaoDespesa.EmAberto,
      limiteDefesa: "",
      paga: false,
      pagaEm: null,
      rastreameDataIso: vencimentoBrToIsoEndDay(patch.dataAutuacao),
      condutorId: opts.clienteId,
      origem: "contrato-criar",
      rastreameTipo: "OUTROS",
      ...patch,
    },
    persistOptsContratoCriar(opts),
  );
  return r.registro;
}

export type DespesasIniciaisContratoResult = {
  caucao: ClienteDespesaRegistro | null;
  semana: ClienteDespesaRegistro | null;
  proximaSemana: ClienteDespesaRegistro | null;
  caucaoParcelas: ClienteDespesaRegistro[];
  semanaParcelas: ClienteDespesaRegistro[];
};

/**
 * Caução e 1.ª semana na retirada (integral ou parcelado):
 * - entrada paga na data do contrato;
 * - parcelas futuras em aberto (caução e/ou saldo da 1.ª semana);
 * - sem parcelamento da semana: próxima semanal em aberto (automático na baixa).
 *
 * Criação inicial: não consulta despesas/contratos existentes — só upserts novos.
 */
export async function gerarDespesasIniciaisContratoAsync(
  reg: ContratoRegistro,
  dados: GerarContratoDados,
  _input: MontarContratoDbInput | null,
): Promise<DespesasIniciaisContratoResult> {
  const inicioBr = reg.dataInicio.trim();
  const placa = reg.placa;
  const veiculoId =
    reg.veiculoId?.trim() && /^[0-9a-f-]{36}$/i.test(reg.veiculoId.trim())
      ? reg.veiculoId.trim()
      : null;
  const clienteId = reg.clienteId;
  const valorSemanal = reg.valorSemanal ?? dados.valores.semana;
  const valorCaucaoTotal = reg.valorCaucao ?? dados.valores.caucao;
  const diaPagamento = dados.diaPagamento ?? reg.diaPagamentoTexto ?? "todos os sábados";
  const pagaEm = vencimentoBrToIsoEndDay(inicioBr);
  const gravarOpts: GravarOpts = {
    veiculoId,
    placa,
    clienteId,
    inicioBr,
    pagaEm,
    valorSemanal,
  };

  const caucaoParcelas: ClienteDespesaRegistro[] = [];
  const semanaParcelas: ClienteDespesaRegistro[] = [];
  let caucao: ClienteDespesaRegistro | null = null;
  let semana: ClienteDespesaRegistro | null = null;
  let proximaSemana: ClienteDespesaRegistro | null = null;

  // --- Caução ---
  if (dados.caucaoParcelas) {
    const cp = dados.caucaoParcelas;
    const entrada = round2(valorCaucaoTotal - cp.aberto);
    if (entrada > 0.01) {
      const r = await gravarPaga(gravarOpts, {
        categoria: CategoriaDespesaCliente.Caucao,
        descricao: infoCaucaoEntrada(),
        dataAutuacao: inicioBr,
        valorMulta: entrada,
      });
      caucao = r.registro;
    }
    for (let i = 0; i < cp.parcelas; i++) {
      const n = i + 1;
      caucaoParcelas.push(
        await gravarAberta(gravarOpts, {
          categoria: CategoriaDespesaCliente.Caucao,
          descricao: infoParcelaCaucao(n, cp.parcelas),
          dataAutuacao: cp.datas[i]!,
          valorMulta: cp.valorParcela,
        }),
      );
    }
  } else if (dados.caucaoSemanalParcelado) {
    const cp = dados.caucaoSemanalParcelado;
    const datas = gerarDatasParcelasCaucao(inicioBr, cp.parcelas, diaPagamento);
    for (let i = 0; i < cp.parcelas; i++) {
      const n = i + 1;
      caucaoParcelas.push(
        await gravarAberta(gravarOpts, {
          categoria: CategoriaDespesaCliente.Caucao,
          descricao: infoParcelaCaucao(n, cp.parcelas),
          dataAutuacao: datas[i]!,
          valorMulta: cp.valorParcela,
        }),
      );
    }
  } else {
    const r = await gravarPaga(gravarOpts, {
      categoria: CategoriaDespesaCliente.Caucao,
      descricao: infoCaucaoEntrada(),
      dataAutuacao: inicioBr,
      valorMulta: valorCaucaoTotal,
    });
    caucao = r.registro;
  }

  // --- 1.ª semana / semanal ---
  const descPrimeiraSemana = montarDescricaoPrimeiraSemanalContrato(inicioBr, diaPagamento);
  if (dados.semanaParcelas) {
    const sp = dados.semanaParcelas;
    if (sp.valorEntrada > 0.01) {
      const r = await gravarPaga(gravarOpts, {
        categoria: CategoriaDespesaCliente.LocacaoSemanal,
        descricao: descPrimeiraSemana,
        dataAutuacao: inicioBr,
        valorMulta: sp.valorEntrada,
      });
      semana = r.registro;
      proximaSemana = r.proximaParcela;
    }
    const datas = gerarDatasParcelasCaucao(inicioBr, sp.parcelas, diaPagamento);
    for (let i = 0; i < sp.parcelas; i++) {
      const n = i + 1;
      semanaParcelas.push(
        await gravarAberta(gravarOpts, {
          categoria: CategoriaDespesaCliente.LocacaoSemanal,
          descricao: infoParcelaPrimeiraSemana(n, sp.parcelas),
          dataAutuacao: datas[i]!,
          valorMulta: sp.valorParcela,
        }),
      );
    }
  } else {
    const r = await gravarPaga(gravarOpts, {
      categoria: CategoriaDespesaCliente.LocacaoSemanal,
      descricao: descPrimeiraSemana,
      dataAutuacao: inicioBr,
      valorMulta: valorSemanal,
    });
    semana = r.registro;
    proximaSemana = r.proximaParcela;
  }

  return { caucao, semana, proximaSemana, caucaoParcelas, semanaParcelas };
}
