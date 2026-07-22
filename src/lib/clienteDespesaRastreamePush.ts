/**
 * Push automático de registos locais → Gastos Gerais (Rastreame).
 * @deprecated Integração descontinuada — não replica mais.
 */
import {
  findClienteDespesaById,
  findClienteDespesaByIdAsync,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";

export type ClienteDespesaPushOpts = {
  /** Ignorado — integração Rastreame descontinuada. */
  syncRastreame?: boolean;
};

/** Recarrega o registo após push (rastreameId / rastreameSyncEm atualizados). */
export async function recarregarClienteDespesaAsync(
  reg: ClienteDespesaRegistro,
): Promise<ClienteDespesaRegistro> {
  return (await findClienteDespesaByIdAsync(reg.id)) ?? reg;
}

/** @deprecated use recarregarClienteDespesaAsync no Postgres */
export function recarregarClienteDespesa(
  reg: ClienteDespesaRegistro,
): ClienteDespesaRegistro {
  return findClienteDespesaById(reg.id) ?? reg;
}

export async function pushClienteDespesaRegistrosNoRastreame(
  regs: ClienteDespesaRegistro[],
  _opts?: ClienteDespesaPushOpts,
): Promise<ClienteDespesaRegistro[]> {
  return regs;
}
