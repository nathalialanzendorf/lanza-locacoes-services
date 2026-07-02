/**
 * Título e classificação de infrações de trânsito.
 *
 * Convenção Lanza (decisão 28/06/2026):
 * - `descricao` espelha o **info** do Rastreame (`ATRASADO Multa …` quando em aberto).
 * - `titulo` guarda o rótulo curto sem a tag (`Multa {tipo} - {dataAutuacao}`).
 */

function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** Categoria é infração de trânsito? */
export function isCategoriaInfracao(categoria?: string): boolean {
  return norm(categoria ?? "Infração").startsWith("infra");
}

/**
 * Deriva um tipo curto (velocidade, estacionamento, cinto…) do texto do DETRAN.
 * Fallback: "trânsito" quando não reconhecer.
 */
export function tipoInfracao(descricao: string): string {
  const t = norm(descricao);
  if (!t.trim()) return "trânsito";

  if (/excesso de vel|superior a (maxima|velocidade)|\bvelocidade\b|\bvel\b/.test(t)) return "velocidade";
  if (/estacion|estac\b/.test(t)) return "estacionamento";
  if (/local\/?horario proibido|parar em local|\bparada\b|\bparar\b/.test(t)) return "parada";
  if (/cinto/.test(t)) return "cinto";
  if (/luz baixa|farol|mant.* acesa|iluminac/.test(t)) return "farol";
  if (/celular|telefone|\bfone\b|seguran[dt]o.* telefone/.test(t)) return "celular";
  if (/sinal vermelho|avancar.* sinal|semaforo|parada obrigatoria|sinal de parada/.test(t)) return "sinal";
  if (/contramao|conversao|convers\b|retorno proibido|ultrapass/.test(t)) return "conversão";
  if (/acostamento/.test(t)) return "acostamento";
  if (/alcool|etilometro|bafometro|recusa.* teste|capacidade psicomotora/.test(t)) return "alcoolemia";
  if (/capacete/.test(t)) return "capacete";
  if (/rodizio/.test(t)) return "rodízio";
  if (/licenciamento|crlv|sem documento|porte.* documento/.test(t)) return "documento";
  if (/\bfaixa\b/.test(t)) return "faixa";
  return "trânsito";
}

/** Monta o título base (sem a tag ATRASADO): `Multa {tipo} - {dataAutuacao}`. */
export function tituloInfracaoBase(descricao: string, dataAutuacao: string): string {
  const tipo = tipoInfracao(descricao);
  const dt = String(dataAutuacao ?? "").trim();
  return dt ? `Multa ${tipo} - ${dt}` : `Multa ${tipo}`;
}

const ATRASADO_RE = /^ATRASADO\s*[-–—:]?\s*/i;

/** Remove o prefixo/tag ATRASADO de um título/descrição. */
export function stripAtrasado(s: string): string {
  return String(s ?? "").replace(ATRASADO_RE, "").trim();
}

/** Heurística: a string parece um título de multa (origem Rastreame) e não o texto do DETRAN? */
export function pareceTituloMulta(s: string): boolean {
  return /^(atrasado\s+)?multa\b/i.test(String(s ?? "").trim());
}

/**
 * Normaliza um título antigo (ex.: "ATRASADO Multa Cinto 10/05/2026 16:44") para o
 * padrão `Multa {tipo} - {data}`, preservando a data/hora embutida no texto.
 */
export function normalizarTituloMulta(s: string): string {
  const base = stripAtrasado(s);
  const tipo = tipoInfracao(base);
  const m = base.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/);
  const dt = m ? m[1]!.trim() : "";
  return dt ? `Multa ${tipo} - ${dt}` : `Multa ${tipo}`;
}

export type RotuloGastoInput = {
  categoria?: string;
  descricao?: string;
  titulo?: string;
  dataAutuacao?: string;
  paga?: boolean;
  situacao?: string;
};

/** Débito em aberto para cobrança (espelho Gastos Gerais / Rastreame). */
export function gastoClienteEmAberto(reg: RotuloGastoInput): boolean {
  if (reg.paga === true) return false;
  const info = String(reg.descricao ?? "").trim();
  if (/^CR[EÉ]DITO\b/i.test(info) || /^D[EÉ]BITO\b/i.test(info)) return true;
  if (/ATRASADO|ATRSAD/i.test(info)) return true;
  return reg.situacao === "Em aberto";
}

/** Rótulo exibido/cobrado — igual ao campo `info` do Rastreame. */
export function rotuloGastoClienteDespesa(reg: RotuloGastoInput): string {
  if (isCategoriaInfracao(reg.categoria)) {
    const base = stripAtrasado(
      reg.titulo?.trim() ||
        (pareceTituloMulta(reg.descricao ?? "")
          ? reg.descricao ?? ""
          : tituloInfracaoBase(reg.descricao ?? "", reg.dataAutuacao ?? "")),
    );
    return reg.paga === true ? base : `ATRASADO ${base}`;
  }
  let info = String(reg.descricao ?? "").trim();
  const emAberto = gastoClienteEmAberto(reg);
  if (emAberto && !/ATRASADO/i.test(info)) {
    info = info.replace(/^ATRASADO\s*[-–—]\s*/i, "").trim();
    info = `ATRASADO ${info}`;
  }
  if (!emAberto && reg.paga === true) {
    info = stripAtrasado(info);
  }
  return info;
}
