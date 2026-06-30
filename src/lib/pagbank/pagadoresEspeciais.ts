/**

 * Pagadores PIX ambíguos / terceiros (pagamento cruzado entre familiares).

 * Usado pelo match PagBank — não gravar em lote sem confirmação do operador.

 */

import { normNomeKey } from "../clientesDb.js";

import type { PagBankCredito } from "./statements.js";



export type MatchConfianca = "alta" | "media" | "baixa";



export type CandidatoMotoristaPagBank = {

  clienteQuery: string;

  /** Incluir clientes inativos (ex.: Gustavo/Laryssa contrato anterior). */

  incluirInativo?: boolean;

  confianca: MatchConfianca;

  revisaoManual: boolean;

  motivoPagador: string;

};



const JULIANO_ID = "a56a4d8e-03d0-4600-b06e-31fab673299a";

const JENNIFER_ID = "7fa5300b-0223-49a2-bf7b-6d6368f22b9d";

const ARLEM_ID = "d83b9728-e78a-4c83-a9a1-b77bfbc08f1d";



const GUSTAVO_QUERY = "GUSTAVO COSTA DE QUADRO";

const JULIANO_QUERY = "Juliano Foizer Silveira";

const JENNIFER_QUERY = "Jennifer da Silva Boeira Rodriguez";

const ARLEM_QUERY = "Arlem Eduardo Preira Rodriguez";



/** Categorias excluídas do match automático por condutor (só modo unitário). */

export const EXCLUIR_CATEGORIA_AUTO: Record<string, string[]> = {

  [JULIANO_ID]: ["Infração"],

};



export function categoriasExcluidasAuto(condutorId: string): string[] {

  return EXCLUIR_CATEGORIA_AUTO[condutorId] ?? [];

}



function normPagador(nome: string | null | undefined): string {

  return normNomeKey(nome ?? "");

}



function contem(hay: string, needle: string): boolean {

  return hay.includes(normNomeKey(needle));

}



function alvoIncluiQuery(clienteQuery: string, query: string): boolean {

  return normNomeKey(clienteQuery).includes(normNomeKey(query));

}



/** Rede Laryssa/Gustavo ↔ Juliano — PIX de qualquer um pode quitar débitos de ambos. */

const CANDIDATOS_LARYSSA_JULIANO: Omit<CandidatoMotoristaPagBank, "motivoPagador">[] = [

  {

    clienteQuery: GUSTAVO_QUERY,

    incluirInativo: true,

    confianca: "media",

    revisaoManual: true,

  },

  {

    clienteQuery: JULIANO_QUERY,

    confianca: "media",

    revisaoManual: true,

  },

];



/** Rede Jennifer ↔ Arlem — PIX de qualquer um pode quitar débitos de ambos. */

const CANDIDATOS_JENNIFER_ARLEM: Omit<CandidatoMotoristaPagBank, "motivoPagador">[] = [

  {

    clienteQuery: JENNIFER_QUERY,

    confianca: "media",

    revisaoManual: true,

  },

  {

    clienteQuery: ARLEM_QUERY,

    confianca: "media",

    revisaoManual: true,

  },

];



function pagadorRedeLaryssaJuliano(pagador: string, texto: string): boolean {

  return (

    contem(pagador, "laryssa") ||

    contem(texto, "laryssa") ||

    contem(pagador, "gustavo costa") ||

    contem(pagador, "costa de quadro") ||

    contem(pagador, "juliano foizer") ||

    contem(pagador, "juliano foizer silveira")

  );

}



function pagadorRedeJenniferArlem(pagador: string): boolean {

  return (

    (contem(pagador, "jennifer") && contem(pagador, "rodriguez")) ||

    contem(pagador, "arlem")

  );

}



function motivoRedeLaryssaJuliano(pagador: string): string {

  if (contem(pagador, "laryssa")) {

    return "PIX pagador Laryssa — pode ser Gustavo/Laryssa ou Juliano (vice-versa)";

  }

  if (contem(pagador, "gustavo costa") || contem(pagador, "costa de quadro")) {

    return "PIX pagador Gustavo — pode ser Gustavo/Laryssa ou Juliano (vice-versa)";

  }

  return "PIX pagador Juliano — pode ser Juliano ou Gustavo/Laryssa (vice-versa)";

}



function motivoRedeJenniferArlem(pagador: string): string {

  if (contem(pagador, "arlem")) {

    return "PIX pagador Arlem — pode ser Arlem ou Jennifer (vice-versa)";

  }

  return "PIX pagador Jennifer — pode ser Jennifer ou Arlem (vice-versa)";

}



/**

 * Quando o nome no PIX não basta, define candidatos a motorista titular.

 * Pagamento cruzado bidirecional: Laryssa↔Gustavo↔Juliano e Jennifer↔Arlem.

 */

export function candidatosMotoristaPorPagador(credito: PagBankCredito): CandidatoMotoristaPagBank[] {

  const pagador = normPagador(credito.nomePagador);

  const texto = normPagador(`${credito.descricao} ${credito.nomePagador ?? ""}`);



  if (pagadorRedeLaryssaJuliano(pagador, texto)) {

    const motivo = motivoRedeLaryssaJuliano(pagador);

    return CANDIDATOS_LARYSSA_JULIANO.map((c) => ({ ...c, motivoPagador: motivo }));

  }



  if (pagadorRedeJenniferArlem(pagador)) {

    const motivo = motivoRedeJenniferArlem(pagador);

    return CANDIDATOS_JENNIFER_ARLEM.map((c) => ({ ...c, motivoPagador: motivo }));

  }



  return [];

}



/** Comprovante quando o pagador PIX não é o titular da despesa alvo. */

export function comprovantePixTerceiro(

  credito: PagBankCredito,

  clienteQuery: string,

): string | null {

  const pagador = normPagador(credito.nomePagador);

  if (!pagador) return null;



  const pagadorProprioGustavo =

    (contem(pagador, "laryssa") ||

      contem(pagador, "gustavo costa") ||

      contem(pagador, "costa de quadro")) &&

    alvoIncluiQuery(clienteQuery, GUSTAVO_QUERY);

  const pagadorProprioJuliano =

    contem(pagador, "juliano foizer") && alvoIncluiQuery(clienteQuery, JULIANO_QUERY);

  const pagadorProprioJennifer =

    contem(pagador, "jennifer") && alvoIncluiQuery(clienteQuery, JENNIFER_QUERY);

  const pagadorProprioArlem =

    contem(pagador, "arlem") && alvoIncluiQuery(clienteQuery, ARLEM_QUERY);



  const redeLaryssaJuliano = pagadorRedeLaryssaJuliano(pagador, pagador);

  const redeJenniferArlem = pagadorRedeJenniferArlem(pagador);



  if (redeLaryssaJuliano && !pagadorProprioGustavo && !pagadorProprioJuliano) {

    return `PIX recebido de ${credito.nomePagador}`;

  }

  if (redeJenniferArlem && !pagadorProprioJennifer && !pagadorProprioArlem) {

    return `PIX recebido de ${credito.nomePagador}`;

  }



  return null;

}



export function motoristaRevisaoManual(condutorId: string): boolean {

  return condutorId === JULIANO_ID || condutorId === JENNIFER_ID || condutorId === ARLEM_ID;

}


