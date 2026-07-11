import {
  categoriaInfereCondutor,
  editarClienteDespesa,
  isClienteDespesaAtiva,
  isInfracaoTransito,
  loadClienteDespesasDb,
  resolverCondutorVigencia,
  saveClienteDespesasDb,
  sincronizarClienteDespesa,
} from "./clienteDespesasDb.js";
import { parseDataAutuacao } from "./inferirCondutorInfracao.js";
import { infracaoNaoCobravelDetran } from "./infracaoTitulo.js";
import {
  clienteDespesaInputFromInfracao,
  loadInfracoesDb,
  origemParceiroInfracaoSemLocatario,
  saveInfracoesDb,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
} from "./infracoesDb.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { removerParceiroDespesaPorOrigem } from "./parceiroDespesasDb.js";
import {
  espelharClienteDespesaSemLocatario,
  espelharInfracaoParceiro,
  reconciliarEspelhosParceiro,
} from "./espelharSemLocatarioParceiro.js";
import { loadVeiculosDb } from "./veiculosDb.js";

export type ReconAcao =
  | "vinculado"
  | "nao-identificado"
  | "cliente-faltando"
  | "sem-data";

export type ReconItem = {
  autoInfracao: string;
  veiculoId: string;
  dataAutuacao: string;
  valorMulta: number;
  acao: ReconAcao;
  cliente?: string | null;
};

export type ReconResult = {
  total: number;
  vinculados: number;
  naoIdentificados: number;
  clienteFaltando: number;
  semData: number;
  parceiroEspelhados: number;
  itens: ReconItem[];
};

function veiculoParticular(placa: string): boolean {
  const key = compactPlaca(placa);
  return (loadVeiculosDb().veiculos ?? []).some(
    (v) => compactPlaca(v.placa) === key && v.particular === true,
  );
}

function espelharParceiroSeParticular(reg: InfracaoRegistro): void {
  if (veiculoParticular(reg.veiculoId)) espelharInfracaoParceiro(reg);
}

function elegivelReconciliarInfracao(r: InfracaoRegistro): boolean {
  if (r.ativo === false) return false;
  if (infracaoNaoCobravelDetran(r)) return false;
  if (r.condutorConfirmado && r.condutorNaoIdentificado) return false;
  if (r.condutorId && r.condutorConfirmado) return false;
  return true;
}

async function promoverInfracaoParaCliente(
  reg: InfracaoRegistro,
  condutorId: string,
  condutorContrato: string | null,
): Promise<void> {
  reg.condutorId = condutorId;
  reg.condutorContrato = condutorContrato;
  reg.condutorConfirmado = true;
  reg.condutorNaoIdentificado = false;
  reg.revisarManual = false;
  reg.revisarMotivo = null;
  reg.atualizadoEm = new Date().toISOString();

  const r = await sincronizarClienteDespesa(reg.veiculoId, clienteDespesaInputFromInfracao(reg));
  if (r.registro.id && r.acao !== "ignorado") {
    vincularClienteDespesaInfracao(reg.numeroAuto, r.registro.id);
    await editarClienteDespesa(r.registro.id, {
      condutorId,
      condutorContrato,
      condutorConfirmado: true,
      condutorNaoIdentificado: false,
      ativo: true,
    });
  }
  removerParceiroDespesaPorOrigem(
    origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto),
  );
}

/**
 * Concilia o condutor das infrações/pedágios **pendentes** (sem condutor e não
 * confirmadas) pela vigência do contrato:
 * - contrato + cliente → vincula e confirma (cliente-despesas; remove espelho parceiro);
 * - sem contrato ativo na data → permanece em parceiro-despesas (`condutorNaoIdentificado`);
 * - contrato achado mas cliente fora de clientes.json → fica pendente (reporta);
 * - sem data de autuação → fica para revisão manual (reporta).
 *
 * Infrações: lê `infracoes.json` (fonte canônica). Pedágios: `cliente-despesas.json`.
 * Idempotente: só mexe em registros pendentes. Quitadas são ignoradas.
 */
export async function reconciliarCondutores(opts?: {
  dryRun?: boolean;
  placa?: string;
  prazoDias?: number;
  incluirPedagios?: boolean;
}): Promise<ReconResult> {
  const filtro = opts?.placa ? compactPlaca(opts.placa) : null;
  const prazoDias = opts?.prazoDias ?? 90;

  const itens: ReconItem[] = [];
  let mutouInfracoes = false;
  let mutouCliente = false;

  const infracoesDb = loadInfracoesDb();
  const promocoes: Promise<void>[] = [];

  for (const r of infracoesDb.infracoes ?? []) {
    if (!elegivelReconciliarInfracao(r)) continue;
    if (filtro && compactPlaca(r.veiculoId) !== filtro) continue;

    const base = {
      autoInfracao: r.numeroAuto,
      veiculoId: formatPlacaHyphen(r.veiculoId),
      dataAutuacao: r.dataAutuacao || "(sem data)",
      valorMulta: Number(r.valorMulta) || 0,
    };

    if (!parseDataAutuacao(r.dataAutuacao)) {
      itens.push({ ...base, acao: "sem-data" });
      continue;
    }

    const res = resolverCondutorVigencia(r.veiculoId, r.dataAutuacao, prazoDias);
    if (res.condutorId) {
      if (!opts?.dryRun) {
        promocoes.push(promoverInfracaoParaCliente(r, res.condutorId, res.condutorContrato));
        mutouInfracoes = true;
      }
      itens.push({ ...base, acao: "vinculado", cliente: res.condutorContrato });
    } else if (res.naoIdentificado) {
      if (!opts?.dryRun) {
        r.condutorConfirmado = true;
        r.condutorNaoIdentificado = true;
        r.condutorId = null;
        r.condutorContrato = null;
        r.atualizadoEm = new Date().toISOString();
        espelharParceiroSeParticular(r);
        mutouInfracoes = true;
      }
      itens.push({ ...base, acao: "nao-identificado" });
    } else {
      if (!opts?.dryRun) {
        r.condutorNaoIdentificado = true;
        r.condutorConfirmado = true;
        r.condutorId = null;
        r.atualizadoEm = new Date().toISOString();
        espelharParceiroSeParticular(r);
        mutouInfracoes = true;
      }
      itens.push({ ...base, acao: "cliente-faltando", cliente: res.condutorContrato });
    }
  }

  const db = loadClienteDespesasDb();
  for (const r of db.clienteDespesas ?? []) {
    if (!isClienteDespesaAtiva(r)) continue;
    const elegivel = opts?.incluirPedagios
      ? categoriaInfereCondutor(r.categoria)
      : isInfracaoTransito(r);
    if (!elegivel) continue;
    if (isInfracaoTransito(r)) continue;
    if (infracaoNaoCobravelDetran(r)) continue;
    if (r.condutorConfirmado === true && r.condutorId && !r.condutorNaoIdentificado) {
      continue;
    }
    if (filtro && compactPlaca(r.veiculoId) !== filtro) continue;

    const base = {
      autoInfracao: r.autoInfracao,
      veiculoId: formatPlacaHyphen(r.veiculoId),
      dataAutuacao: r.dataAutuacao || "(sem data)",
      valorMulta: Number(r.valorMulta) || 0,
    };

    if (!parseDataAutuacao(r.dataAutuacao)) {
      itens.push({ ...base, acao: "sem-data" });
      continue;
    }

    const res = resolverCondutorVigencia(r.veiculoId, r.dataAutuacao, prazoDias);
    if (res.condutorId) {
      if (!opts?.dryRun) {
        r.condutorId = res.condutorId;
        r.condutorContrato = res.condutorContrato;
        r.condutorConfirmado = true;
        r.condutorNaoIdentificado = false;
        r.atualizadoEm = new Date().toISOString();
        mutouCliente = true;
      }
      itens.push({ ...base, acao: "vinculado", cliente: res.condutorContrato });
    } else if (res.naoIdentificado) {
      if (!opts?.dryRun) {
        r.condutorConfirmado = true;
        r.condutorNaoIdentificado = true;
        r.atualizadoEm = new Date().toISOString();
        espelharClienteDespesaSemLocatario(r);
        mutouCliente = true;
      }
      itens.push({ ...base, acao: "nao-identificado" });
    } else {
      if (!opts?.dryRun && r.condutorContrato !== res.condutorContrato) {
        r.condutorContrato = res.condutorContrato;
        r.atualizadoEm = new Date().toISOString();
        mutouCliente = true;
      }
      itens.push({ ...base, acao: "cliente-faltando", cliente: res.condutorContrato });
    }
  }

  if (promocoes.length) await Promise.all(promocoes);
  if (mutouInfracoes && !opts?.dryRun) saveInfracoesDb(infracoesDb);
  if (mutouCliente && !opts?.dryRun) saveClienteDespesasDb(db);

  const parceiro = reconciliarEspelhosParceiro({
    dryRun: opts?.dryRun,
    placa: opts?.placa,
    prazoDias,
  });

  return {
    total: itens.length,
    vinculados: itens.filter((i) => i.acao === "vinculado").length,
    naoIdentificados: itens.filter((i) => i.acao === "nao-identificado").length,
    clienteFaltando: itens.filter((i) => i.acao === "cliente-faltando").length,
    semData: itens.filter((i) => i.acao === "sem-data").length,
    itens,
    parceiroEspelhados: parceiro.espelhados,
  };
}
