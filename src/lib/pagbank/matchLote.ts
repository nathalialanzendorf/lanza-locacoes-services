/**

 * Cruza créditos PagBank com clientes e despesas em aberto → planos de baixa.

 */

import fs from "node:fs";

import path from "node:path";



import { normNomeKey } from "../clientesDb.js";

import {

  montarPlanoBaixa,

  resolverCliente,

  type PlanoBaixaRecebimento,

} from "../recebimento/baixaPlano.js";

import { REPO_ROOT } from "../repoRoot.js";

import {

  candidatosMotoristaPorPagador,

  categoriasExcluidasAuto,

  comprovantePixTerceiro,

  motoristaRevisaoManual,

} from "./pagadoresEspeciais.js";

import type { PagBankCredito } from "./statements.js";



export type MatchConfianca = "alta" | "media" | "baixa";



export type PlanoPagBank = {

  pagbank: {

    id: string;

    valor: number;

    dataBr: string;

    horaBr: string | null;

    descricao: string;

    nomePagador: string | null;

  };

  clienteQuery: string;

  confianca: MatchConfianca;

  motivo: string;

  plano: PlanoBaixaRecebimento;

  /** Operador deve confirmar manualmente (ex.: Juliano / PIX da Laryssa). */

  revisaoManual: boolean;

  /** Pagamento provavelmente já quitado no database. */
  jaBaixado?: boolean;

  idempotencia?: import("../recebimento/idempotenciaBaixa.js").IdempotenciaBaixa;

};



export type LotePagBankResult = {

  intervalo: { initialDate: string; finalDate: string };

  creditos: number;

  planos: PlanoPagBank[];

  semMatch: PagBankCredito[];

};



/** Ordenação do lote: mais recente primeiro (data + hora do PIX). */
function msCreditoPagBank(c: { dataBr: string; horaBr?: string | null }): number {
  const p = c.dataBr.split("/").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return 0;
  const [dia, mes, ano] = p as [number, number, number];
  let ms = new Date(ano, mes - 1, dia).getTime();
  if (c.horaBr) {
    const t = c.horaBr.split(":").map(Number);
    if (t.length >= 2 && !t.some((n) => Number.isNaN(n))) {
      ms += ((t[0] ?? 0) * 60 + (t[1] ?? 0)) * 60_000;
    }
  }
  return ms;
}

function compararCreditoRecentePrimeiro(
  a: { dataBr: string; horaBr?: string | null },
  b: { dataBr: string; horaBr?: string | null },
): number {
  return msCreditoPagBank(b) - msCreditoPagBank(a);
}



type ClienteDb = { id?: string; nome?: string; ativo?: boolean };



type MatchCliente = {

  query: string;

  confianca: MatchConfianca;

  motivo: string;

  revisaoManual: boolean;

};



function loadClientesAtivos(): ClienteDb[] {

  const p = path.join(REPO_ROOT, "database", "clientes.json");

  const j = JSON.parse(fs.readFileSync(p, "utf8")) as { clientes?: ClienteDb[] };

  return (j.clientes ?? []).filter((c) => c.ativo !== false && c.nome && c.id);

}



function tokensNome(nome: string): string[] {

  return normNomeKey(nome)

    .split(" ")

    .filter((t) => t.length >= 3);

}



function scoreCliente(descricao: string, nomePagador: string | null, clienteNome: string): number {

  const texto = normNomeKey(`${descricao} ${nomePagador ?? ""}`);

  const cn = normNomeKey(clienteNome);

  if (!cn || !texto) return 0;

  if (texto.includes(cn)) return 100;

  const tokens = tokensNome(clienteNome);

  if (tokens.length === 0) return 0;

  let hit = 0;

  for (const t of tokens) {

    if (texto.includes(t)) hit++;

  }

  if (hit >= 2) return 70 + hit;

  if (hit === 1 && tokens[0] && texto.includes(tokens[0]!)) return 40;

  return 0;

}



function resolverClientePorNome(credito: PagBankCredito): MatchCliente | null {

  const clientes = loadClientesAtivos();

  const scored = clientes

    .map((c) => ({

      c,

      score: scoreCliente(credito.descricao, credito.nomePagador, c.nome!),

    }))

    .filter((x) => x.score > 0)

    .sort((a, b) => b.score - a.score);



  if (scored.length === 0) return null;



  const best = scored[0]!;

  const second = scored[1];

  if (second && best.score - second.score < 15 && second.score >= 40) {

    return null;

  }

  const nkBest = normNomeKey(best.c.nome!);
  const nkSecond = second ? normNomeKey(second.c.nome!) : "";
  if (
    second &&
    nkBest.includes("rodriguez") &&
    nkSecond.includes("rodriguez") &&
    best.score - second.score < 25
  ) {
    return null;
  }



  let confianca: MatchConfianca = "baixa";

  if (best.score >= 90) confianca = "alta";

  else if (best.score >= 55) confianca = "media";



  const revisaoManual = motoristaRevisaoManual(best.c.id!);

  if (revisaoManual && confianca === "alta") confianca = "media";



  const via = credito.nomePagador ? `nome no extrato (${credito.nomePagador})` : "descrição do extrato";

  return {

    query: best.c.nome!,

    confianca,

    motivo: `Cliente ${best.c.nome} (score ${best.score}) via ${via}`,

    revisaoManual,

  };

}



function resolverMatchesCredito(credito: PagBankCredito): MatchCliente[] {

  const especiais = candidatosMotoristaPorPagador(credito);

  if (especiais.length > 0) {

    return especiais.map((c) => ({

      query: c.clienteQuery,

      confianca: c.confianca,

      motivo: c.motivoPagador,

      revisaoManual: c.revisaoManual,

    }));

  }

  const um = resolverClientePorNome(credito);

  return um ? [um] : [];

}



function isPixRecebimento(credito: PagBankCredito): boolean {

  const type = String(credito.raw.type ?? "").toUpperCase();

  if (type === "PAYMENT_RELEASE") return false;

  if (/^PIX_RECEIVE|TRANSFER_RECEIVE$/i.test(type)) return true;

  const desc = credito.descricao.toLowerCase();

  return /pix receb|transfer.*receb/i.test(desc);

}



function ajustarConfiancaPorData(

  confianca: MatchConfianca,

  plano: PlanoBaixaRecebimento,

): MatchConfianca {

  const delta = plano.despesaAlvo?.diasDoVencimento;

  if (delta == null) return confianca;

  const abs = Math.abs(delta);

  if (abs <= 3) return confianca;

  if (abs <= 7) return confianca === "alta" ? "media" : confianca;

  return "baixa";

}



function montarPlanoCredito(

  credito: PagBankCredito,

  match: MatchCliente,

): PlanoBaixaRecebimento | null {

  try {

    const cliente = resolverCliente(match.query);

    const comprovanteHint = /desconto|manuten/i.test(credito.descricao) ? credito.descricao : null;

    const comprovante =
      comprovanteHint ?? comprovantePixTerceiro(credito, match.query);



    const plano = montarPlanoBaixa({

      clienteQuery: match.query,

      valor: credito.valor,

      dataBr: credito.dataBr,

      horaBr: credito.horaBr,

      comprovante,

      desconto: comprovanteHint != null,

      origemExterna: `pagbank:${credito.id}`,

      excluirCategoriasAuto: categoriasExcluidasAuto(cliente.id!),

      revisaoManual: match.revisaoManual || motoristaRevisaoManual(cliente.id!),

    });



    if (plano.linhas.length === 0) return null;

    if (match.revisaoManual) {

      plano.avisos.push("Revisão manual obrigatória — pagador/motorista ambíguo (ex.: Laryssa vs Juliano).");

    }

    return plano;

  } catch {

    return null;

  }

}



function escolherMelhorPlano(

  credito: PagBankCredito,

  matches: MatchCliente[],

): { match: MatchCliente; plano: PlanoBaixaRecebimento } | null {

  const candidatos: Array<{ match: MatchCliente; plano: PlanoBaixaRecebimento; dist: number }> = [];



  for (const match of matches) {

    const plano = montarPlanoCredito(credito, match);

    if (!plano) continue;

    const dist = Math.abs(plano.despesaAlvo?.diasDoVencimento ?? 9999);

    candidatos.push({ match, plano, dist });

  }



  if (candidatos.length === 0) return null;



  candidatos.sort((a, b) => a.dist - b.dist);

  const best = candidatos[0]!;



  if (candidatos.length > 1 && matches.some((m) => m.revisaoManual)) {

    const second = candidatos[1]!;

    if (Math.abs(best.dist - second.dist) <= 2 && best.match.query !== second.match.query) {

      return null;

    }

  }



  return { match: best.match, plano: best.plano };

}



export function montarLotePagBank(

  creditos: PagBankCredito[],

  intervalo: { initialDate: string; finalDate: string },

): LotePagBankResult {

  const planos: PlanoPagBank[] = [];

  const semMatch: PagBankCredito[] = [];



  for (const credito of creditos) {

    if (!isPixRecebimento(credito)) {

      semMatch.push(credito);

      continue;

    }



    const matches = resolverMatchesCredito(credito);

    if (matches.length === 0) {

      semMatch.push(credito);

      continue;

    }



    const escolhido = escolherMelhorPlano(credito, matches);

    if (!escolhido) {

      semMatch.push(credito);

      continue;

    }



    const { match, plano } = escolhido;

    let confianca = ajustarConfiancaPorData(match.confianca, plano);

    if (plano.revisaoManual) confianca = "baixa";
    if (plano.idempotencia?.status !== "ok") confianca = "baixa";

    let motivo = match.motivo;

    const alvo = plano.despesaAlvo;

    if (alvo) {

      motivo += ` | venc. ${alvo.dataVencimento}`;

      if (alvo.diasDoVencimento != null) {

        motivo += ` | recebimento ${alvo.diasDoVencimento >= 0 ? "+" : ""}${alvo.diasDoVencimento}d`;

      }

    }

    if (credito.nomePagador) motivo += ` | pagador PIX: ${credito.nomePagador}`;

    for (const av of plano.avisos) {
      if (/vencimento|próximo|Revisão manual|Idempotência/i.test(av)) motivo += ` | ${av}`;
    }
    if (plano.idempotencia && plano.idempotencia.status !== "ok") {
      motivo += ` | ⚠ ${plano.idempotencia.motivo}`;
    }

    planos.push({
      pagbank: {
        id: credito.id,
        valor: credito.valor,
        dataBr: credito.dataBr,
        horaBr: credito.horaBr,
        descricao: credito.descricao,
        nomePagador: credito.nomePagador,
      },
      clienteQuery: match.query,
      confianca,
      motivo,
      plano,
      revisaoManual: Boolean(plano.revisaoManual),
      jaBaixado: plano.idempotencia?.status !== "ok",
      idempotencia: plano.idempotencia?.status !== "ok" ? plano.idempotencia : undefined,
    });

  }

  planos.sort((a, b) => compararCreditoRecentePrimeiro(a.pagbank, b.pagbank));
  semMatch.sort(compararCreditoRecentePrimeiro);

  return {

    intervalo,

    creditos: creditos.length,

    planos,

    semMatch,

  };

}


