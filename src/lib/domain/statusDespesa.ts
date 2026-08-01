import { SituacaoDespesa, type SituacaoDespesaValor } from "./situacaoDespesa.js";
import { hojeBr, pagaEmInputToIso } from "../dataBr.js";

/** Status de cobrança persistido (`status_cobranca`). */
export const StatusCobrancaDespesa = {
  EmAberto: "em_aberto",
  Pago: "pago",
  Baixado: "baixado",
} as const;

export type StatusCobrancaDespesaValor =
  (typeof StatusCobrancaDespesa)[keyof typeof StatusCobrancaDespesa];

/** Valor interno de filtro/cadastro (UI). */
export const StatusDespesaFiltro = {
  EmAberto: "em_aberto",
  Pago: "pago",
  Baixado: "baixado",
  Todos: "todos",
} as const;

export type StatusDespesaFiltroValor =
  (typeof StatusDespesaFiltro)[keyof typeof StatusDespesaFiltro];

export type StatusDespesaCadastro =
  | typeof StatusDespesaFiltro.EmAberto
  | typeof StatusDespesaFiltro.Pago
  | typeof StatusDespesaFiltro.Baixado;

export function isStatusCobrancaDespesaValor(
  v: string | null | undefined,
): v is StatusCobrancaDespesaValor {
  const s = String(v ?? "").trim();
  return (
    s === StatusCobrancaDespesa.EmAberto ||
    s === StatusCobrancaDespesa.Pago ||
    s === StatusCobrancaDespesa.Baixado
  );
}

/** Resolve status de cobrança a partir do campo canónico + legado `paga`. */
export function resolverStatusCobranca(d: {
  statusCobranca?: string | null;
  paga?: boolean;
}): StatusCobrancaDespesaValor {
  if (isStatusCobrancaDespesaValor(d.statusCobranca)) {
    return d.statusCobranca;
  }
  return d.paga === true ? StatusCobrancaDespesa.Pago : StatusCobrancaDespesa.EmAberto;
}

export function camposStatusDespesaDeCadastro(
  status: StatusDespesaCadastro,
  pagaEmAtual?: string | null,
): {
  paga: boolean;
  statusCobranca: StatusCobrancaDespesaValor;
  situacao: SituacaoDespesaValor;
  pagaEm: string | null;
} {
  if (status === StatusDespesaFiltro.Pago) {
    const br = pagaEmAtual?.trim() || hojeBr();
    return {
      paga: true,
      statusCobranca: StatusCobrancaDespesa.Pago,
      situacao: SituacaoDespesa.Pago,
      pagaEm: pagaEmInputToIso(br),
    };
  }
  if (status === StatusDespesaFiltro.Baixado) {
    return {
      paga: false,
      statusCobranca: StatusCobrancaDespesa.Baixado,
      situacao: SituacaoDespesa.Baixado,
      pagaEm: null,
    };
  }
  return {
    paga: false,
    statusCobranca: StatusCobrancaDespesa.EmAberto,
    situacao: SituacaoDespesa.EmAberto,
    pagaEm: null,
  };
}
