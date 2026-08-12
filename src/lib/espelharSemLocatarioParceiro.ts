/**
 * Infrações e pedágios sem locatário → parceiro-despesas.json (custo do dono).
 * Espelho em cliente-despesas é removido; cobrança de locatário não se aplica.
 */
import {
  categoriaInfereCondutor,
  excluirClienteDespesa,
  isClienteDespesaAtiva,
  isInfracaoTransito,
  loadClienteDespesasDb,
  loadClienteDespesasDbAsync,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { parseDataAutuacao } from "./inferirCondutorInfracao.js";
import { infracaoNaoCobravelDetran } from "./infracaoTitulo.js";
import {
  infracaoDeveEspelharParceiroDespesa,
  loadInfracoesDb,
  loadInfracoesDbAsync,
  origemParceiroInfracaoSemLocatario,
  parceiroDespesaInputFromInfracao,
  type InfracaoRegistro,
} from "./infracoesDb.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import {
  competenciaFromData,
  sincronizarParceiroDespesa,
  sincronizarParceiroDespesaAsync,
  type GravarParceiroDespesaResult,
  type ParceiroDespesaInput,
} from "./parceiroDespesasDb.js";
import { parceiroDebitoConfirmado } from "./responsavelDebito.js";
import { isCategoriaPedagio } from "./pedagioCategoria.js";

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
  return parceiroDebitoConfirmado(d);
}

/** Cobrança WhatsApp de locatário — exclui débitos do parceiro. */
export function despesaCobravelLocatario(d: ClienteDespesaRegistro): boolean {
  if (!isClienteDespesaAtiva(d)) return false;
  if (clienteDespesaDeveEspelharParceiro(d)) return false;
  if (d.condutorNaoIdentificado === true && !d.condutorId) return false;
  if (isInfracaoTransito(d)) {
    if (infracaoNaoCobravelDetran(d)) return false;
    if (!d.condutorConfirmado) return false;
    return !!d.condutorId;
  }
  if (isCategoriaPedagio(d.categoria)) {
    return !!d.condutorId && d.condutorConfirmado === true;
  }
  return true;
}

export function espelharInfracaoParceiro(
  reg: InfracaoRegistro,
): GravarParceiroDespesaResult | null {
  if (!infracaoDeveEspelharParceiroDespesa(reg)) return null;
  void excluirClienteDespesa(reg.numeroAuto, { syncRastreame: false });
  return sincronizarParceiroDespesa(parceiroDespesaInputFromInfracao(reg));
}

export async function espelharInfracaoParceiroAsync(
  reg: InfracaoRegistro,
): Promise<GravarParceiroDespesaResult | null> {
  if (!infracaoDeveEspelharParceiroDespesa(reg)) return null;
  await excluirClienteDespesa(reg.numeroAuto, { syncRastreame: false });
  return sincronizarParceiroDespesaAsync(parceiroDespesaInputFromInfracao(reg));
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
    void excluirClienteDespesa(d.autoInfracao, { syncRastreame: false });
  } else {
    void excluirClienteDespesa(d.id, { syncRastreame: false });
  }
  return r;
}

export async function espelharClienteDespesaSemLocatarioAsync(
  d: ClienteDespesaRegistro,
): Promise<GravarParceiroDespesaResult | null> {
  if (!clienteDespesaDeveEspelharParceiro(d)) return null;
  const input = isInfracaoTransito(d)
    ? parceiroDespesaInputFromClienteInfracaoSemLocatario(d)
    : parceiroDespesaInputFromPedagioSemLocatario(d);
  const r = await sincronizarParceiroDespesaAsync(input);
  if (isInfracaoTransito(d)) {
    await excluirClienteDespesa(d.autoInfracao, { syncRastreame: false });
  } else {
    await excluirClienteDespesa(d.id, { syncRastreame: false });
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
 * Espelha em parceiro-despesas infrações/pedágios com débito ao parceiro **confirmado**
 * e inativa o espelho cliente quando aplicável.
 */
export function reconciliarEspelhosParceiro(opts?: {
  dryRun?: boolean;
  placa?: string;
}): ReconciliarParceiroResult {
  const filtro = opts?.placa ? compactPlaca(opts.placa) : null;
  const itens: ReconciliarParceiroItem[] = [];
  let espelhados = 0;

  const infracoesDb = loadInfracoesDb();

  for (const reg of infracoesDb.infracoes ?? []) {
    if (filtro && compactPlaca(reg.veiculoId) !== filtro) continue;
    if (!infracaoDeveEspelharParceiroDespesa(reg)) continue;

    const base = {
      placa: formatPlacaHyphen(reg.veiculoId),
      chave: reg.numeroAuto,
      tipo: "infracao" as const,
    };

    if (!opts?.dryRun) {
      espelharInfracaoParceiro(reg);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  const db = loadClienteDespesasDb();

  for (const d of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(d)) continue;
    if (!categoriaInfereCondutor(d.categoria)) continue;
    if (filtro && compactPlaca(d.veiculoId) !== filtro) continue;
    if (!clienteDespesaDeveEspelharParceiro(d)) continue;

    const base = {
      placa: formatPlacaHyphen(d.veiculoId),
      chave: d.autoInfracao,
      tipo: isInfracaoTransito(d) ? ("infracao" as const) : ("pedagio" as const),
    };

    if (!opts?.dryRun) {
      espelharClienteDespesaSemLocatario(d);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  return {
    espelhados,
    ignorados: itens.filter((i) => i.acao === "ignorado").length,
    itens,
  };
}

export async function reconciliarEspelhosParceiroAsync(opts?: {
  dryRun?: boolean;
  placa?: string;
}): Promise<ReconciliarParceiroResult> {
  const filtro = opts?.placa ? compactPlaca(opts.placa) : null;
  const itens: ReconciliarParceiroItem[] = [];
  let espelhados = 0;

  const infracoesDb = await loadInfracoesDbAsync();

  for (const reg of infracoesDb.infracoes ?? []) {
    if (filtro && compactPlaca(reg.veiculoId) !== filtro) continue;
    if (!infracaoDeveEspelharParceiroDespesa(reg)) continue;

    const base = {
      placa: formatPlacaHyphen(reg.veiculoId),
      chave: reg.numeroAuto,
      tipo: "infracao" as const,
    };

    if (!opts?.dryRun) {
      await espelharInfracaoParceiroAsync(reg);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  const db = await loadClienteDespesasDbAsync();

  for (const d of db.clienteDespesas) {
    if (!isClienteDespesaAtiva(d)) continue;
    if (!categoriaInfereCondutor(d.categoria)) continue;
    if (filtro && compactPlaca(d.veiculoId) !== filtro) continue;
    if (!clienteDespesaDeveEspelharParceiro(d)) continue;

    const base = {
      placa: formatPlacaHyphen(d.veiculoId),
      chave: d.autoInfracao,
      tipo: isInfracaoTransito(d) ? ("infracao" as const) : ("pedagio" as const),
    };

    if (!opts?.dryRun) {
      await espelharClienteDespesaSemLocatarioAsync(d);
      espelhados++;
    }
    itens.push({ ...base, acao: opts?.dryRun ? "ignorado" : "espelhado" });
  }

  return {
    espelhados,
    ignorados: itens.filter((i) => i.acao === "ignorado").length,
    itens,
  };
}
