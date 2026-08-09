import {
  editarClienteDespesa,
  excluirClienteDespesa,
  findClienteDespesaByReferenciaAsync,
  gravarClienteDespesa,
  isClienteDespesaEmAberto,
  isClienteDespesaPaga,
  type ClienteDespesaInput,
} from "./clienteDespesasDb.js";
import {
  autoInfracaoEntradaVenda,
  autoInfracaoParcelaVenda,
  CategoriaDespesaVenda,
} from "./domain/categoriaDespesaVenda.js";
import { formatDataBr, gerarDatasParcelasMensal, parseDataBrToDate } from "./caucaoParcelas.js";
import type { VendaRegistro } from "./vendasDb.js";

type LinhaDespesaVenda = {
  autoInfracao: string;
  categoria: string;
  descricao: string;
  dataAutuacao: string;
  valorMulta: number;
};

function normalizarDataBr(raw: string | null | undefined, fallback: string): string {
  const t = String(raw ?? "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return fallback;
}

function datasParcelasVenda(dataPrimeiraParcelaBr: string, quantidade: number): string[] {
  if (quantidade < 1) return [];
  const diaMes = parseDataBrToDate(dataPrimeiraParcelaBr).getDate();
  return gerarDatasParcelasMensal(dataPrimeiraParcelaBr, quantidade, diaMes);
}

export function montarLinhasDespesasVenda(venda: VendaRegistro): LinhaDespesaVenda[] {
  const placa = venda.placa.trim() || "—";
  const dataVendaBr = normalizarDataBr(venda.dataVenda, formatDataBr(new Date()));
  const linhas: LinhaDespesaVenda[] = [];

  const entrada = venda.valorEntrada ?? 0;
  if (entrada > 0) {
    linhas.push({
      autoInfracao: autoInfracaoEntradaVenda(venda.id),
      categoria: CategoriaDespesaVenda.Entrada,
      descricao: `Venda ${placa} — Entrada`,
      dataAutuacao: dataVendaBr,
      valorMulta: entrada,
    });
  }

  const qtd = venda.quantidadeParcelas ?? 0;
  const valorParcela = venda.valorParcela ?? 0;
  if (qtd > 0 && valorParcela > 0) {
    const baseParcelaBr = normalizarDataBr(venda.dataPagamentoParcelas, dataVendaBr);
    const datas = datasParcelasVenda(baseParcelaBr, qtd);
    for (let i = 0; i < qtd; i++) {
      const n = i + 1;
      linhas.push({
        autoInfracao: autoInfracaoParcelaVenda(venda.id, n),
        categoria: CategoriaDespesaVenda.Parcela,
        descricao: `Venda ${placa} — Parcela ${n}/${qtd}`,
        dataAutuacao: datas[i] ?? baseParcelaBr,
        valorMulta: valorParcela,
      });
    }
  }

  return linhas;
}

/** Gera ou atualiza parcelas/entrada em cliente_despesas a partir do registo de venda. */
export async function sincronizarDespesasVenda(venda: VendaRegistro): Promise<{ criadas: number; atualizadas: number }> {
  if (!venda.ativo) return { criadas: 0, atualizadas: 0 };
  if (!venda.veiculoId?.trim()) return { criadas: 0, atualizadas: 0 };
  if (!venda.clienteId?.trim()) return { criadas: 0, atualizadas: 0 };

  const linhas = montarLinhasDespesasVenda(venda);
  const esperados = new Set(linhas.map((l) => l.autoInfracao.toUpperCase()));
  let criadas = 0;
  let atualizadas = 0;

  for (const linha of linhas) {
    const existente = await findClienteDespesaByReferenciaAsync(linha.autoInfracao);
    if (existente) {
      if (isClienteDespesaPaga(existente) || !isClienteDespesaEmAberto(existente)) continue;
      await editarClienteDespesa(existente.id, {
        descricao: linha.descricao,
        dataAutuacao: linha.dataAutuacao,
        valorMulta: linha.valorMulta,
        categoria: linha.categoria,
        condutorId: venda.clienteId,
        condutorConfirmado: true,
      });
      atualizadas++;
      continue;
    }

    const input: ClienteDespesaInput = {
      autoInfracao: linha.autoInfracao,
      descricao: linha.descricao,
      dataAutuacao: linha.dataAutuacao,
      valorMulta: linha.valorMulta,
      categoria: linha.categoria,
      localInfracao: "",
      situacao: "Em aberto",
      limiteDefesa: linha.dataAutuacao,
      condutorId: venda.clienteId,
      statusCobranca: "em_aberto",
      origem: "venda-sync",
    };

    await gravarClienteDespesa(venda.veiculoId, input, {
      skipInferir: true,
      skipDupCheck: false,
      syncRastreame: false,
      veiculoId: venda.veiculoId,
    });
    criadas++;
  }

  // Remove parcelas/entrada em aberto que deixaram de existir no plano
  for (let p = 1; p <= 60; p++) {
    const auto = autoInfracaoParcelaVenda(venda.id, p);
    if (esperados.has(auto.toUpperCase())) continue;
    const reg = await findClienteDespesaByReferenciaAsync(auto);
    if (!reg) break;
    if (isClienteDespesaEmAberto(reg) && !isClienteDespesaPaga(reg)) {
      await excluirClienteDespesa(reg.id);
    }
  }
  const entAuto = autoInfracaoEntradaVenda(venda.id);
  if (!esperados.has(entAuto.toUpperCase())) {
    const ent = await findClienteDespesaByReferenciaAsync(entAuto);
    if (ent && isClienteDespesaEmAberto(ent) && !isClienteDespesaPaga(ent)) {
      await excluirClienteDespesa(ent.id);
    }
  }

  return { criadas, atualizadas };
}
