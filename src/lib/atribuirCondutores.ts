import {

  categoriaInfereCondutor,

  editarClienteDespesa,

  isClienteDespesaAtiva,

  isInfracaoTransito,

  loadClienteDespesasDb,

  resolverCondutorVigencia,

  saveClienteDespesasDb,

  sincronizarClienteDespesa,

  type ClienteDespesaRegistro,

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

  despesaResponsavelConfirmado,

  infracaoResponsavelConfirmado,

} from "./responsavelDebito.js";



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



function elegivelReconciliarInfracao(r: InfracaoRegistro): boolean {

  if (r.ativo === false) return false;

  if (infracaoNaoCobravelDetran(r)) return false;

  if (infracaoResponsavelConfirmado(r)) return false;

  return true;

}



function elegivelReconciliarDespesa(r: ClienteDespesaRegistro): boolean {

  if (!isClienteDespesaAtiva(r)) return false;

  if (infracaoNaoCobravelDetran(r)) return false;

  if (despesaResponsavelConfirmado(r)) return false;

  return true;

}



function aplicarSugestaoInfracao(

  reg: InfracaoRegistro,

  res: ReturnType<typeof resolverCondutorVigencia>,

): void {

  reg.debitoParceiroConfirmado = false;

  reg.debitoParceiroId = null;

  reg.revisarManual = false;

  reg.revisarMotivo = null;

  reg.condutorConfirmado = false;



  if (res.condutorId) {

    reg.condutorId = res.condutorId;

    reg.condutorContrato = res.condutorContrato;

    reg.condutorNaoIdentificado = false;

    return;

  }



  reg.condutorId = null;

  reg.condutorContrato = res.condutorContrato;

  reg.condutorNaoIdentificado = true;

}



function aplicarSugestaoDespesa(

  reg: ClienteDespesaRegistro,

  res: ReturnType<typeof resolverCondutorVigencia>,

): void {

  reg.debitoParceiroConfirmado = false;

  reg.debitoParceiroId = null;

  reg.revisarManual = false;

  reg.revisarMotivo = null;

  reg.condutorConfirmado = false;



  if (res.condutorId) {

    reg.condutorId = res.condutorId;

    reg.condutorContrato = res.condutorContrato;

    reg.condutorNaoIdentificado = false;

    return;

  }



  reg.condutorId = null;

  reg.condutorContrato = res.condutorContrato;

  reg.condutorNaoIdentificado = true;

}



/** Confirma cliente responsável pela infração e espelha em cliente-despesas. */

export async function confirmarClienteInfracao(

  numeroAuto: string,

  clienteId: string,

): Promise<InfracaoRegistro | null> {

  const db = loadInfracoesDb();

  const key = numeroAuto.trim().toUpperCase();

  const idx = db.infracoes.findIndex((i) => i.numeroAuto.trim().toUpperCase() === key);

  if (idx < 0) return null;



  const reg = db.infracoes[idx]!;

  reg.condutorId = clienteId.trim();

  reg.condutorConfirmado = true;

  reg.condutorNaoIdentificado = false;

  reg.debitoParceiroConfirmado = false;

  reg.debitoParceiroId = null;

  reg.revisarManual = false;

  reg.revisarMotivo = null;

  reg.atualizadoEm = new Date().toISOString();



  const r = await sincronizarClienteDespesa(reg.veiculoId, clienteDespesaInputFromInfracao(reg));

  if (r.registro.id && r.acao !== "ignorado") {

    vincularClienteDespesaInfracao(reg.numeroAuto, r.registro.id);

    await editarClienteDespesa(r.registro.id, {

      condutorId: reg.condutorId,

      condutorContrato: reg.condutorContrato,

      condutorConfirmado: true,

      condutorNaoIdentificado: false,

      ativo: true,

    });

  }

  removerParceiroDespesaPorOrigem(

    origemParceiroInfracaoSemLocatario(reg.veiculoId, reg.numeroAuto),

  );



  db.infracoes[idx] = reg;

  saveInfracoesDb(db);

  return reg;

}



/**

 * Infere o responsável (cliente ou parceiro) de infrações/pedágios pendentes.

 * Grava apenas **sugestão** — confirmação manual via API/UI antes de cobrar ou espelhar parceiro.

 */

export async function reconciliarCondutores(opts?: {

  dryRun?: boolean;

  placa?: string;

  prazoDias?: number;

  incluirPedagios?: boolean;

  somentePedagios?: boolean;

}): Promise<ReconResult> {

  const filtro = opts?.placa ? compactPlaca(opts.placa) : null;

  const prazoDias = opts?.prazoDias ?? 90;



  const itens: ReconItem[] = [];

  let mutouInfracoes = false;

  let mutouCliente = false;



  const infracoesDb = loadInfracoesDb();



  if (!opts?.somentePedagios) {

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

      if (!opts?.dryRun) {

        aplicarSugestaoInfracao(r, res);

        r.atualizadoEm = new Date().toISOString();

        mutouInfracoes = true;

      }



      if (res.condutorId) {

        itens.push({ ...base, acao: "vinculado", cliente: res.condutorContrato });

      } else if (res.naoIdentificado) {

        itens.push({ ...base, acao: "nao-identificado" });

      } else {

        itens.push({ ...base, acao: "cliente-faltando", cliente: res.condutorContrato });

      }

    }

  }



  const processarPedagios = opts?.incluirPedagios === true || opts?.somentePedagios === true;

  const db = loadClienteDespesasDb();

  for (const r of db.clienteDespesas ?? []) {

    if (!elegivelReconciliarDespesa(r)) continue;

    const elegivel = processarPedagios

      ? categoriaInfereCondutor(r.categoria)

      : isInfracaoTransito(r);

    if (!elegivel) continue;

    if (isInfracaoTransito(r)) continue;

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

    if (!opts?.dryRun) {

      aplicarSugestaoDespesa(r, res);

      r.atualizadoEm = new Date().toISOString();

      mutouCliente = true;

    }



    if (res.condutorId) {

      itens.push({ ...base, acao: "vinculado", cliente: res.condutorContrato });

    } else if (res.naoIdentificado) {

      itens.push({ ...base, acao: "nao-identificado" });

    } else {

      itens.push({ ...base, acao: "cliente-faltando", cliente: res.condutorContrato });

    }

  }



  if (mutouInfracoes && !opts?.dryRun) saveInfracoesDb(infracoesDb);

  if (mutouCliente && !opts?.dryRun) saveClienteDespesasDb(db);



  return {

    total: itens.length,

    vinculados: itens.filter((i) => i.acao === "vinculado").length,

    naoIdentificados: itens.filter((i) => i.acao === "nao-identificado").length,

    clienteFaltando: itens.filter((i) => i.acao === "cliente-faltando").length,

    semData: itens.filter((i) => i.acao === "sem-data").length,

    itens,

    parceiroEspelhados: 0,

  };

}


