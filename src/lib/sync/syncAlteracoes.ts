import type { ClienteDespesaRegistro } from "../clienteDespesasDb.js";
import type { GravarParceiroDespesaResult } from "../parceiroDespesasDb.js";

/** Linha de alteração exposta na UI após sync. */
export type SyncAlteracaoStatus =
  | "cadastrado"
  | "alterado"
  | "excluido"
  | "nao_alterado"
  | "ignorado";

export type SyncAlteracaoEntidade =
  | "infracao"
  | "cobranca"
  | "despesa_parceiro"
  | "pedagio"
  | "estacionamento"
  | "fipe"
  | "detran_rs";

export type SyncAlteracaoLinha = {
  placa: string;
  entidade: SyncAlteracaoEntidade;
  referencia: string;
  descricao: string;
  valor?: number | null;
  data?: string | null;
  status: SyncAlteracaoStatus;
  aviso?: string | null;
};

export function acaoParaStatusSync(acao: string): SyncAlteracaoStatus {
  switch (acao) {
    case "novo":
      return "cadastrado";
    case "atualizado":
      return "alterado";
    case "ignorado":
      return "ignorado";
    case "sem_alteracao":
      return "nao_alterado";
    default:
      return "nao_alterado";
  }
}

export function flattenAlteracoesSync<T extends { alteracoes?: SyncAlteracaoLinha[] }>(
  items: T[],
): SyncAlteracaoLinha[] {
  return items.flatMap((i) => i.alteracoes ?? []);
}

export function linhaFromClienteDespesa(
  placa: string,
  entidade: SyncAlteracaoEntidade,
  reg: ClienteDespesaRegistro,
  acao: string,
  aviso?: string | null,
  referencia?: string,
): SyncAlteracaoLinha {
  return {
    placa,
    entidade,
    referencia: referencia ?? (reg.autoInfracao || reg.id),
    descricao: reg.descricao || reg.titulo || "",
    valor: reg.valorMulta ?? null,
    data: reg.dataAutuacao || null,
    status: acaoParaStatusSync(acao),
    aviso: aviso ?? null,
  };
}

export function linhaFromParceiroDespesa(
  placa: string,
  reg: GravarParceiroDespesaResult["registro"],
  acao: string,
  aviso?: string | null,
): SyncAlteracaoLinha {
  return {
    placa,
    entidade: "despesa_parceiro",
    referencia: reg.origem || reg.id,
    descricao: reg.descricao || reg.categoria,
    valor: reg.valor ?? null,
    data: reg.data || null,
    status: acaoParaStatusSync(acao),
    aviso: aviso ?? null,
  };
}

export function pushIgnorado(
  out: SyncAlteracaoLinha[],
  placa: string,
  entidade: SyncAlteracaoEntidade,
  referencia: string,
  aviso: string,
  descricao = "",
): void {
  out.push({
    placa,
    entidade,
    referencia,
    descricao,
    status: "ignorado",
    aviso,
  });
}
