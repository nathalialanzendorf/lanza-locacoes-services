/**
 * Push automático de registos locais → Gastos Gerais (Rastreame).
 * Chamado após gravar/editar em cliente-despesas.json (cadastro manual e syncs).
 */
import {
  findClienteDespesaById,
  isSyncRastreameEligible,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";

export type ClienteDespesaPushOpts = {
  /** Default true — replica no Rastreame após persistir localmente. */
  syncRastreame?: boolean;
};

/** Recarrega o registo após push (rastreameId / rastreameSyncEm atualizados). */
export function recarregarClienteDespesa(
  reg: ClienteDespesaRegistro,
): ClienteDespesaRegistro {
  return findClienteDespesaById(reg.id) ?? reg;
}

export async function pushClienteDespesaRegistrosNoRastreame(
  regs: ClienteDespesaRegistro[],
  opts?: ClienteDespesaPushOpts,
): Promise<ClienteDespesaRegistro[]> {
  if (opts?.syncRastreame === false) {
    return regs.map(recarregarClienteDespesa);
  }

  const { replicarClienteDespesaNoRastreame } = await import("./rastreame/recebimentosSync.js");
  const out: ClienteDespesaRegistro[] = [];

  for (const reg of regs) {
    if (!isSyncRastreameEligible(reg) && reg.ativo !== false) {
      out.push(recarregarClienteDespesa(reg));
      continue;
    }
    try {
      await replicarClienteDespesaNoRastreame(reg);
    } catch (e) {
      console.error(
        `[aviso] falha sync Rastreame (${reg.autoInfracao}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    out.push(recarregarClienteDespesa(reg));
  }

  return out;
}
