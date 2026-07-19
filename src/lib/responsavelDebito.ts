import type { ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import type { InfracaoRegistro } from "./infracoesDb.js";

/** Responsável (cliente ou parceiro) confirmado manualmente pelo operador. */
export function infracaoResponsavelConfirmado(
  reg: Pick<
    InfracaoRegistro,
    | "quitadaDetran"
    | "debitoParceiroConfirmado"
    | "condutorConfirmado"
    | "condutorId"
    | "condutorNaoIdentificado"
  >,
): boolean {
  if (reg.quitadaDetran) return true;
  if (reg.debitoParceiroConfirmado === true) return true;
  if (reg.condutorConfirmado === true && reg.condutorId) return true;
  if (reg.condutorConfirmado === true && reg.condutorNaoIdentificado === true) return true;
  return false;
}

export function despesaResponsavelConfirmado(
  d: Pick<
    ClienteDespesaRegistro,
    | "quitadaDetran"
    | "paga"
    | "debitoParceiroConfirmado"
    | "condutorConfirmado"
    | "condutorId"
    | "condutorNaoIdentificado"
  >,
): boolean {
  if (d.quitadaDetran || d.paga === true) return true;
  if (d.debitoParceiroConfirmado === true) return true;
  if (d.condutorConfirmado === true && d.condutorId) return true;
  if (d.condutorConfirmado === true && d.condutorNaoIdentificado === true) return true;
  return false;
}

export function parceiroDebitoConfirmado(
  reg: Pick<
    InfracaoRegistro | ClienteDespesaRegistro,
    "debitoParceiroConfirmado" | "condutorNaoIdentificado" | "condutorConfirmado"
  >,
): boolean {
  if (reg.debitoParceiroConfirmado === true) return true;
  return reg.condutorNaoIdentificado === true && reg.condutorConfirmado === true;
}
