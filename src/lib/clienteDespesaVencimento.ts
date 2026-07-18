import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { vencimentoDespesaSemanalBr } from "./pagamentoSemanal.js";

function extrairDataBr(valor: string | null | undefined): string | null {
  const m = String(valor ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
  return m?.[1] ?? null;
}

/** Vencimento DD/MM/AAAA para exibição (listagem, dashboard, cobrança). */
export function vencimentoClienteDespesaBr(
  d: Pick<
    ClienteDespesaRegistro,
    | "descricao"
    | "rastreameDataIso"
    | "dataAutuacao"
    | "dataVencimentoOriginal"
    | "dataLimiteDefesa"
    | "limiteDefesa"
  >,
): string | null {
  const boleto =
    extrairDataBr(d.dataVencimentoOriginal) ??
    extrairDataBr(d.dataLimiteDefesa) ??
    extrairDataBr(d.limiteDefesa);
  if (boleto) return boleto;

  return (
    vencimentoDespesaSemanalBr(d.descricao ?? "", d.rastreameDataIso, d.dataAutuacao) ??
    extrairDataBr(d.dataAutuacao)
  );
}
