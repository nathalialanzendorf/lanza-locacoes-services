/**
 * Alvos elegíveis por tipo de cobrança (somente despesas em aberto + frota ativa).
 */
import {
  isClienteDespesaAtiva,
  isInfracaoTransito,
  loadClienteDespesasDb,
  parseRastreameIdFromAuto,
  type ClienteDespesaRegistro,
} from "./clienteDespesasDb.js";
import { loadClientesDb } from "./clientesDb.js";
import {
  contratoMaisRecentePar,
  loadContratosDb,
  type ContratoRegistro,
} from "./contratosDb.js";
import { inferirCondutorInfracao } from "./inferirCondutorInfracao.js";
import { dataVencimentoSemanalBr } from "./pagamentoSemanal.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { loadVeiculosDb } from "./veiculosDb.js";

export type TipoCobrancaAction =
  | "pagamento-semanal"
  | "renegociacao"
  | "infracoes"
  | "pedagio"
  | "estacionamento-rotativo"
  | "manutencao";

export const TIPOS_COBRANCA_ACTION: readonly TipoCobrancaAction[] = [
  "pagamento-semanal",
  "renegociacao",
  "infracoes",
  "pedagio",
  "estacionamento-rotativo",
  "manutencao",
] as const;

export type AlvoCobranca = {
  tipo: TipoCobrancaAction;
  placa: string;
  clienteId: string | null;
  clienteNome: string | null;
  /** Despesas em aberto que fundamentam a cobrança. */
  despesas: ClienteDespesaRegistro[];
  /** Vencimentos semanais (pagamento-semanal). */
  vencimentosBr?: string[];
};

function veiculosAtivos() {
  const map = new Map<string, ReturnType<typeof loadVeiculosDb>["veiculos"][0]>();
  for (const v of loadVeiculosDb().veiculos) {
    if (v.ativo === false) continue;
    if (v.particular === true) continue;
    map.set(compactPlaca(v.placa), v);
  }
  return map;
}

function clientesAtivos() {
  const map = new Map<string, { id: string; nome: string }>();
  for (const c of loadClientesDb().clientes) {
    if (c.ativo === false) continue;
    if (c.id) map.set(c.id, { id: c.id, nome: c.nome });
  }
  return map;
}

function despesaAberta(d: ClienteDespesaRegistro): boolean {
  return (
    isClienteDespesaAtiva(d) &&
    d.paga !== true &&
    (d.situacao === "Em aberto" || !d.paga)
  );
}

function placaElegivel(placa: string, veiculos: ReturnType<typeof veiculosAtivos>): boolean {
  return veiculos.has(compactPlaca(placa));
}

function clienteElegivel(
  clienteId: string | null | undefined,
  clientes: ReturnType<typeof clientesAtivos>,
): boolean {
  if (!clienteId) return true;
  return clientes.has(clienteId);
}

/** Pagamento semanal só com contrato ativo locatário + veículo (encerrado → renegociação). */
function temContratoAtivoLocacao(
  clienteId: string | null | undefined,
  placa: string,
): boolean {
  if (!clienteId) return false;
  const contrato = contratoMaisRecentePar({ placa, clienteId });
  return contrato?.status === "ativo";
}

function contratoAtivoPorPlaca(placa: string): ContratoRegistro | undefined {
  const p = compactPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) => c.status === "ativo" && compactPlaca(c.placa) === p,
  );
  if (list.length === 0) return undefined;
  return list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0))[0];
}

/**
 * Despesa ATRASADO pode ter condutorId antigo (ex.: troca de locatário).
 * Usa o contrato ativo da placa quando o condutor da linha não tem contrato vigente.
 * Nome de exibição vem do contrato (ex.: Laryssa no cadastro, não Gustavo do Rastreame).
 */
function condutorEfetivoPagamentoSemanal(
  d: ClienteDespesaRegistro,
  placa: string,
  clientes: ReturnType<typeof clientesAtivos>,
): { clienteId: string | null; clienteNome: string | null } {
  const placaFmt = formatPlacaHyphen(placa);

  if (d.condutorId) {
    const contratoCondutor = contratoMaisRecentePar({
      placa: placaFmt,
      clienteId: d.condutorId,
    });
    if (contratoCondutor?.status === "ativo") {
      const cliente = clientes.get(d.condutorId);
      return {
        clienteId: d.condutorId,
        clienteNome: contratoCondutor.clienteNome ?? cliente?.nome ?? null,
      };
    }
    // Ex-locatário desta placa — semanal vira renegociação.
    if (contratoCondutor?.status === "encerrado") {
      return { clienteId: null, clienteNome: null };
    }
    // Condutor na linha não é locatário deste veículo — não reatribuir ao atual.
    return { clienteId: null, clienteNome: null };
  }

  const vigente = contratoAtivoPorPlaca(placaFmt);
  if (vigente?.clienteId) {
    return {
      clienteId: vigente.clienteId,
      clienteNome: vigente.clienteNome,
    };
  }

  const cliente = d.condutorId ? clientes.get(d.condutorId) : null;
  return { clienteId: d.condutorId ?? null, clienteNome: cliente?.nome ?? null };
}

/** ATRASADO antigo já coberto por semana regular paga depois (ex.: Quarta 01 com Quarta 17 paga). */
function semanalAtrasoObsoleto(
  d: ClienteDespesaRegistro,
  todas: ClienteDespesaRegistro[],
  clienteId: string,
  placa: string,
): boolean {
  const atrasoIso = d.pagaEm ?? d.rastreameDataIso;
  if (!atrasoIso) return false;
  const atrasoTime = Date.parse(atrasoIso);

  const placaKey = compactPlaca(placa);
  for (const other of todas) {
    if (other.id === d.id) continue;
    if (other.categoria !== "Locação semanal") continue;
    if (compactPlaca(other.veiculoId) !== placaKey) continue;
    if (other.condutorId !== clienteId) continue;
    if (other.paga !== true) continue;

    const desc = other.descricao ?? "";
    if (/ATRASADO/i.test(desc)) continue;
    if (/\[NEGOCIADO/i.test(desc)) continue;

    const pagoIso = other.pagaEm ?? other.rastreameDataIso;
    if (!pagoIso) continue;
    if (Date.parse(pagoIso) <= atrasoTime) continue;

    return true;
  }
  return false;
}

/** Condutor responsável pela infração na data da autuação (não o locatário atual da placa). */
function condutorEfetivoInfracao(
  d: ClienteDespesaRegistro,
  clientes: ReturnType<typeof clientesAtivos>,
): { clienteId: string | null; clienteNome: string | null } {
  if (d.condutorId) {
    const cliente = clientes.get(d.condutorId);
    return { clienteId: d.condutorId, clienteNome: cliente?.nome ?? null };
  }
  const sug = inferirCondutorInfracao(
    formatPlacaHyphen(d.veiculoId),
    d.dataAutuacao,
    90,
  );
  if (sug.condutorId) {
    const cliente = clientes.get(sug.condutorId);
    return {
      clienteId: sug.condutorId,
      clienteNome: sug.clienteNome ?? cliente?.nome ?? null,
    };
  }
  return { clienteId: null, clienteNome: null };
}

function agruparInfracoesPorCondutor(
  despesas: ClienteDespesaRegistro[],
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
): AlvoCobranca[] {
  const porChave = new Map<string, AlvoCobranca>();

  for (const d of despesas) {
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    const placa = formatPlacaHyphen(d.veiculoId);
    const efetivo = condutorEfetivoInfracao(d, clientes);
    if (efetivo.clienteId && !clienteElegivel(efetivo.clienteId, clientes)) continue;

    const chave = `${compactPlaca(placa)}|${efetivo.clienteId ?? ""}`;
    let alvo = porChave.get(chave);
    if (!alvo) {
      alvo = {
        tipo: "infracoes",
        placa,
        clienteId: efetivo.clienteId,
        clienteNome: efetivo.clienteNome,
        despesas: [],
      };
      porChave.set(chave, alvo);
    }
    alvo.despesas.push(d);
  }

  return [...porChave.values()].sort((a, b) => a.placa.localeCompare(b.placa));
}

function agruparPorPlaca(
  tipo: TipoCobrancaAction,
  despesas: ClienteDespesaRegistro[],
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
): AlvoCobranca[] {
  const porPlaca = new Map<string, ClienteDespesaRegistro[]>();
  for (const d of despesas) {
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    if (!clienteElegivel(d.condutorId, clientes)) continue;
    const p = formatPlacaHyphen(d.veiculoId);
    const list = porPlaca.get(p) ?? [];
    list.push(d);
    porPlaca.set(p, list);
  }

  const out: AlvoCobranca[] = [];
  for (const [placa, list] of porPlaca) {
    const condutorId = list.find((x) => x.condutorId)?.condutorId ?? null;
    const cliente = condutorId ? clientes.get(condutorId) : null;
    out.push({
      tipo,
      placa,
      clienteId: condutorId,
      clienteNome: cliente?.nome ?? null,
      despesas: list,
    });
  }
  return out.sort((a, b) => a.placa.localeCompare(b.placa));
}

function filtrarPagamentoSemanal(
  db: ReturnType<typeof loadClienteDespesasDb>,
  veiculos: ReturnType<typeof veiculosAtivos>,
  clientes: ReturnType<typeof clientesAtivos>,
  placaFiltro?: string,
): AlvoCobranca[] {
  const alvoPlaca = placaFiltro ? compactPlaca(placaFiltro) : null;
  const porChave = new Map<string, AlvoCobranca>();

  for (const d of db.clienteDespesas) {
    if (!despesaAberta(d)) continue;
    if (d.categoria !== "Locação semanal") continue;
    if (!/ATRASADO/i.test(d.descricao)) continue;
    if (!placaElegivel(d.veiculoId, veiculos)) continue;
    if (!clienteElegivel(d.condutorId, clientes)) continue;
    if (alvoPlaca && compactPlaca(d.veiculoId) !== alvoPlaca) continue;

    const placa = formatPlacaHyphen(d.veiculoId);
    const efetivo = condutorEfetivoPagamentoSemanal(d, placa, clientes);
    if (!efetivo.clienteId || !temContratoAtivoLocacao(efetivo.clienteId, placa)) {
      continue;
    }
    if (
      semanalAtrasoObsoleto(
        d,
        db.clienteDespesas,
        efetivo.clienteId,
        placa,
      )
    ) {
      continue;
    }

    const chave = `${efetivo.clienteId}|${compactPlaca(placa)}`;
    const venc =
      dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao;

    let alvo = porChave.get(chave);
    if (!alvo) {
      alvo = {
        tipo: "pagamento-semanal",
        placa,
        clienteId: efetivo.clienteId,
        clienteNome: efetivo.clienteNome,
        despesas: [],
        vencimentosBr: [],
      };
      porChave.set(chave, alvo);
    }
    alvo.despesas.push(d);
    if (venc && !alvo.vencimentosBr!.includes(venc)) {
      alvo.vencimentosBr!.push(venc);
    }
  }

  return [...porChave.values()]
    .map((a) => ({
      ...a,
      vencimentosBr: [...(a.vencimentosBr ?? [])].sort((x, y) =>
        x.split("/").reverse().join("").localeCompare(y.split("/").reverse().join("")),
      ),
    }))
    .sort((a, b) => a.placa.localeCompare(b.placa));
}

export type FiltroAlvosCobranca = {
  /** Limita a uma placa. */
  placa?: string;
  /** Limita a um cliente (nome, CPF ou id — resolvido em clientes.json). */
  clienteId?: string;
};

function filtrarAlvosPorEscopo(
  alvos: AlvoCobranca[],
  filtro?: FiltroAlvosCobranca,
): AlvoCobranca[] {
  if (!filtro?.placa && !filtro?.clienteId) return alvos;
  return alvos.filter((a) => {
    if (filtro.placa && compactPlaca(a.placa) !== compactPlaca(filtro.placa)) {
      return false;
    }
    if (filtro.clienteId && a.clienteId !== filtro.clienteId) {
      return false;
    }
    return true;
  });
}

export function normalizarTipoCobrancaAction(raw: string): TipoCobrancaAction | null {
  const t = raw.trim().toLowerCase();
  const map: Record<string, TipoCobrancaAction> = {
    "pagamento-semanal": "pagamento-semanal",
    pagamento_semanal: "pagamento-semanal",
    renegociacao: "renegociacao",
    renegociação: "renegociacao",
    infracoes: "infracoes",
    infrações: "infracoes",
    pedagio: "pedagio",
    pedágio: "pedagio",
    "estacionamento-rotativo": "estacionamento-rotativo",
    manutencao: "manutencao",
    manutenção: "manutencao",
  };
  return map[t] ?? null;
}

/** Lista alvos elegíveis para um tipo de cobrança. Sem alvos = array vazio. */
export function listarAlvosCobranca(
  tipo: TipoCobrancaAction,
  filtro?: FiltroAlvosCobranca,
): AlvoCobranca[] {
  const db = loadClienteDespesasDb();
  const veiculos = veiculosAtivos();
  const clientes = clientesAtivos();
  const placaFiltro = filtro?.placa;

  let alvos: AlvoCobranca[];

  if (tipo === "pagamento-semanal") {
    alvos = filtrarPagamentoSemanal(db, veiculos, clientes, placaFiltro);
  } else {
    const categoriaMap: Record<
      Exclude<TipoCobrancaAction, "pagamento-semanal" | "infracoes">,
      string
    > = {
      renegociacao: "Renegociação",
      pedagio: "Pedágio",
      "estacionamento-rotativo": "Estacionamento",
      manutencao: "Manutenção",
    };

    if (tipo === "infracoes") {
      const despesas = db.clienteDespesas.filter((d) => {
        if (!despesaAberta(d)) return false;
        if (!isInfracaoTransito(d)) return false;
        if (d.quitadaDetran === true) return false;
        if (d.origem === "rastreame") return false;
        if (parseRastreameIdFromAuto(d.autoInfracao)) return false;
        if (placaFiltro && compactPlaca(d.veiculoId) !== compactPlaca(placaFiltro)) {
          return false;
        }
        return true;
      });
      alvos = agruparInfracoesPorCondutor(despesas, veiculos, clientes);
    } else {
      const categoria =
        categoriaMap[tipo as Exclude<TipoCobrancaAction, "pagamento-semanal" | "infracoes">];
      const despesas = db.clienteDespesas.filter((d) => {
        if (!despesaAberta(d)) return false;
        if ((d.categoria ?? "") !== categoria) return false;
        if (tipo === "manutencao" && d.valorMulta <= 0) return false;
        if (placaFiltro && compactPlaca(d.veiculoId) !== compactPlaca(placaFiltro)) {
          return false;
        }
        return true;
      });
      alvos = agruparPorPlaca(tipo, despesas, veiculos, clientes);
    }
  }

  return filtrarAlvosPorEscopo(alvos, filtro);
}
