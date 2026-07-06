/**
 * Infrações e pedágios sem locatário → parceiro-despesas.json (custo do dono).
 * Espelho em cliente-despesas é inativado; cobrança de locatário não se aplica.
 */
import {
  categoriaInfereCondutor,
  inativarEspelhoClienteInfracao,
  isClienteDespesaAtiva,
  isInfracaoSemDataAutuacao,
  isInfracaoTransito,
  loadClienteDespesasDb,
  resolverCondutorVigencia,
  saveClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { parseDataAutuacao } from "./inferirCondutorInfracao.js";
import { infracaoNaoCobravelDetran } from "./infracaoTitulo.js";
import {
  infracaoDeveEspelharParceiroDespesa,
  loadInfracoesDb,
  origemParceiroInfracaoSemLocatario,
  parceiroDespesaInputFromInfracao,
  saveInfracoesDb,
  type InfracaoRegistro,
} from "./infracoesDb.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import {
  competenciaFromData,
  sincronizarParceiroDespesa,
  type GravarParceiroDespesaResult,
  type ParceiroDespesaInput,
} from "./parceiroDespesasDb.js";

export function origemParceiroPedagioSemLocatario(placa: string, autoInfracao: string): string {
  const placaKey = compactPlaca(placa);
  const auto = String(autoInfracao).trim().toUpperCase();
  return `pedagio-digital/sem-locatario/${placaKey}/${auto}`;
}

function dataParceiroDespesa(dataAutuacao: string, limiteDefesa?: string): string {
  const m = String(dataAutuacao ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (m) return m[1]!;
  const l = String(limiteDefesa ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
  if (l) return l[1]!;
  const iso = String(limiteDefesa ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return "";
}

export function parceiroDespesaInputFromPedagioSemLocatario(
  d: ClienteDespesaRegistro,
): ParceiroDespesaInput {
  const data = dataParceiroDespesa(d.dataAutuacao, d.limiteDefesa);
  return {
    placa: d.veiculoId,
    categoria: "Outros",
    descricao: `Pedágio sem locatário — ${d.descricao.trim()} (${d.autoInfracao})`,
    data,
    valor: d.valorMulta,
    competencia: competenciaFromData(data),
    origem: origemParceiroPedagioSemLocatario(d.veiculoId, d.autoInfracao),
  };
}

export function parceiroDespesaInputFromClienteInfracaoSemLocatario(
  d: ClienteDespesaRegistro,
): ParceiroDespesaInput {
  const data = dataParceiroDespesa(d.dataAutuacao, d.limiteDefesa);
  const auto = String(d.autoInfracao).trim();
  return {
    placa: d.veiculoId,
    categoria: "Outros",
    descricao: `Multa sem locatário — ${d.descricao.trim()} (${auto})`,
    data,
    valor: d.valorMulta,
    competencia: competenciaFromData(data),
    origem: origemParceiroInfracaoSemLocatario(d.veiculoId, auto),
  };
}

/** Débito em cliente-despesas que deve ir ao parceiro (sem locatário na data). */
export function clienteDespesaDeveEspelharParceiro(d: ClienteDespesaRegistro): boolean {
  if (!isClienteDespesaAtiva(d)) return false;
  if (d.paga === true) return false;
  if (!categoriaInfereCondutor(d.categoria)) return false;
  if (d.condutorId) return false;
  if (Number(d.valorMulta) <= 0) return false;
  if (isInfracaoTransito(d) && infracaoNaoCobravelDetran(d)) return false;
  return (
    d.condutorNaoIdentificado === true ||
    d.revisarManual === true ||
    (isInfracaoTransito(d) && isInfracaoSemDataAutuacao(d)) ||
    (!d.condutorId && !!d.condutorContrato)
  );
}

/** Cobrança WhatsApp de locatário — exclui débitos do parceiro. */
export function despesaCobravelLocatario(d: ClienteDespesaRegistro): boolean {
  if (!isClienteDespesaAtiva(d)) return false;
  if (clienteDespesaDeveEspelharParceiro(d)) return false;
  if (d.condutorNaoIdentificado === true) return false;
  if (isInfracaoTransito(d)) {
    if (infracaoNaoCobravelDetran(d)) return false;
    if (isInfracaoSemDataAutuacao(d) && !d.condutorId) return false;
    if (!d.condutorId && d.condutorContrato) return false;
    return !!d.condutorId;
  }
  if ((d.categoria ?? "") === "Pedágio") {
    return !!d.condutorId;
  }
  return true;
}

function inativarClienteDespesa(d: ClienteDespesaRegistro): void {
  const db = loadClienteDespesasDb();
  const idx = db.clienteDespesas.findIndex((x) => x.id === d.id);
  if (idx < 0 || db.clienteDespesas[idx]!.ativo === false) return;
  db.clienteDespesas[idx]!.ativo = false;
  db.clienteDespesas[idx]!.atualizadoEm = new Date().toISOString();
  saveClienteDespesasDb(db);
}

export function espelharInfracaoParceiro(
  reg: InfracaoRegistro,
): GravarParceiroDespesaResult | null {
  if (!infracaoDeveEspelharParceiroDespesa(reg)) return null;
  inativarEspelhoClienteInfracao(reg.numeroAuto);
  return sincronizarParceiroDespesa(parceiroDespesaInputFromInfracao(reg));
}

export function espelharClienteDespesaSemLocatario(
  d: ClienteDespesaRegistro,
): GravarParceiroDespesaResult | null {
  if (!clienteDespesaDeveEspelharParceiro(d)) return null;
  const input = isInfracaoTransito(d)
    ? parceiroDespesaInputFromClienteInfracaoSemLocatario(d)
    : parceiroDespesaInputFromPedagioSemLocatario(d);
  const r = sincronizarParceiroDespesa(input);
  if (isInfracaoTransito(d)) {
    inativarEspelhoClienteInfracao(d.autoInfracao);
  } else {
    inativarClienteDespesa(d);
  }
  return r;
}

export type ReconciliarParceiroItem = {
  placa: string;
  chave: string;
  tipo: "infracao" | "pedagio";
  acao: "espelhado" | "ignorado";
};

export type ReconciliarParceiroResult = {
  espelhados: number;
  ignorados: number;
  itens: ReconciliarParceiroItem[];
};

/**
 * Espelha em parceiro-despesas todas as infrações/pedágios sem locatário
 * (infracoes.json + cliente-despesas.json) e inativa o espelho cliente.
 */
export function reconciliarEspelhosParceiro(opts?: {
  dryRun?: boolean;
  placa?: string;
  prazoDias?: number;
}): ReconciliarParceiroResult {
  const filtro = opts?.placa ? compactPlaca(opts.placa) : null;
  const prazoDias = opts?.prazoDias ?? 90;
  const itens: ReconciliarParceiroItem[] = [];
  let espelhados = 0;

  const infracoesDb = loadInfracoesDb();
  let mutouInfracoes = false;

  for (const reg of infracoesDb.infracoes ?? []) {
    if (filtro && compactPlaca(reg.veiculoId) !== filtro) continue;
    if (!infracaoDeveEspelharParceiroDespesa(reg)) continue;

    const base = {
      placa: formatPlacaHyphen(reg.veiculoId),
      chave: reg.numeroAuto,
      tipo: "infracao" as const,
    };

    if (!opts?.dryRun) {
      if (!reg.condutorNaoIdentificado && !reg.revisarManual) {
        reg.condutorNaoIdentificado = true;
        reg.condutorConfirmado = true;
        mutouInfracoes = true;
      }
      espelharInfracaoParceiro(reg);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  const db = loadClienteDespesasDb();
  let mutouCliente = false;

  for (const d of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(d)) continue;
    if (!categoriaInfereCondutor(d.categoria)) continue;
    if (isInfracaoTransito(d)) continue;
    if (filtro && compactPlaca(d.veiculoId) !== filtro) continue;
    if (d.condutorId) continue;
    if (d.paga === true) continue;
    if (Number(d.valorMulta) <= 0) continue;

    const data = String(d.dataAutuacao ?? "").trim();
    if (data && parseDataAutuacao(data)) {
      const res = resolverCondutorVigencia(d.veiculoId, d.dataAutuacao, prazoDias);
      if (res.condutorId) continue;
      if (!res.naoIdentificado && !opts?.dryRun) {
        d.condutorNaoIdentificado = true;
        d.condutorConfirmado = true;
        mutouCliente = true;
      }
    } else if (!d.condutorNaoIdentificado && !d.revisarManual) {
      if (!opts?.dryRun) {
        d.revisarManual = true;
        d.condutorNaoIdentificado = true;
        d.condutorConfirmado = true;
        mutouCliente = true;
      }
    }

    if (!clienteDespesaDeveEspelharParceiro(d)) continue;

    const base = {
      placa: formatPlacaHyphen(d.veiculoId),
      chave: d.autoInfracao,
      tipo: "pedagio" as const,
    };

    if (!opts?.dryRun) {
      espelharClienteDespesaSemLocatario(d);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  for (const d of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(d)) continue;
    if (!isInfracaoTransito(d)) continue;
    if (filtro && compactPlaca(d.veiculoId) !== filtro) continue;
    if (!clienteDespesaDeveEspelharParceiro(d)) continue;

    const canon = infracoesDb.infracoes?.find(
      (r) => r.numeroAuto.trim().toUpperCase() === d.autoInfracao.trim().toUpperCase(),
    );
    if (canon && infracaoDeveEspelharParceiroDespesa(canon)) continue;

    const base = {
      placa: formatPlacaHyphen(d.veiculoId),
      chave: d.autoInfracao,
      tipo: "infracao" as const,
    };

    if (!opts?.dryRun) {
      if (!d.condutorNaoIdentificado) {
        d.condutorNaoIdentificado = true;
        d.condutorConfirmado = true;
        mutouCliente = true;
      }
      espelharClienteDespesaSemLocatario(d);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  if (mutouInfracoes && !opts?.dryRun) saveInfracoesDb(infracoesDb);
  if (mutouCliente && !opts?.dryRun) saveClienteDespesasDb(db);

  return {
    espelhados,
    ignorados: itens.filter((i) => i.acao === "ignorado").length,
    itens,
  };
}
