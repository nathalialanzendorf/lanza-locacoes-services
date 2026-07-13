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

/** Monta o título base (sem a tag ATRASADO): `Multa {tipo} {numeroAuto} - {dataAutuacao}`. */
export function tituloInfracaoBase(
  descricao: string,
  dataAutuacao: string,
  numeroAuto?: string,
): string {
  const tipo = tipoInfracao(descricao);
  const auto = String(numeroAuto ?? "").trim();
  const autoPart = auto ? ` ${auto}` : "";
  const dt = String(dataAutuacao ?? "").trim();
  return dt ? `Multa ${tipo}${autoPart} - ${dt}` : `Multa ${tipo}${autoPart}`;
}

function normStatusDetran(s?: string | null): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

/** Infração convertida em advertência no DETRAN (sem débito ao locatário). */
export function infracaoAdvertida(reg: {
  statusInfracao?: string;
  statusDetran?: string;
  situacao?: string;
}): boolean {
  const s = normStatusDetran(
    reg.statusInfracao ?? reg.statusDetran ?? reg.situacao,
  );
  return s === "advertida" || s === "advertido";
}

/** Status DETRAN que não geram cobrança ao locatário (encerramento, sync espelho, etc.). */
export function infracaoNaoCobravelDetran(reg: {
  statusInfracao?: string;
  statusDetran?: string;
  quitadaDetran?: boolean;
}): boolean {
  if (infracaoAdvertida(reg)) return true;
  if (reg.quitadaDetran === true) return true;
  const s = normStatusDetran(reg.statusInfracao ?? reg.statusDetran);
  return s === "paga" || s === "justificada";
}

function autoInfracaoEspelhoRastreame(auto?: string): boolean {
  return /^RAST-\d+$/i.test(String(auto ?? "").trim());
}

/**
 * Espelho Rastreame puro (auto `RAST-*` ou `origem: rastreame` sem auto DETRAN) — omitir em relatórios.
 * Linhas com auto DETRAN (`P0…`, `J…`) ou `detranAutoInfracao` permanecem — são a fonte cobrável,
 * mesmo após pull do Gastos Gerais sobrescrever `origem` para `rastreame`.
 */
export function infracaoEspelhoDuplicataRelatorio(reg: {
  origem?: string;
  autoInfracao?: string;
  detranAutoInfracao?: string | null;
}): boolean {
  const auto = String(reg.autoInfracao ?? "").trim();
  if (autoInfracaoEspelhoRastreame(auto)) return true;
  if (reg.detranAutoInfracao?.trim()) return false;
  if (auto && !autoInfracaoEspelhoRastreame(auto)) return false;
  return reg.origem === "rastreame";
}

/** Infração entra na listagem de relatórios (cobrança / encerramento) — qualquer status. */
export function infracaoIncluirListagemRelatorio(reg: {
  categoria?: string;
  ativo?: boolean;
  origem?: string;
  autoInfracao?: string;
  detranAutoInfracao?: string | null;
}): boolean {
  if (reg.ativo === false) return false;
  if (!isCategoriaInfracao(reg.categoria)) return false;
  if (infracaoEspelhoDuplicataRelatorio(reg)) return false;
  return true;
}

/** Infração quitada no DETRAN (histórico / paga no portal). */
export function infracaoQuitadaDetran(reg: {
  statusInfracao?: string;
  statusDetran?: string;
  quitadaDetran?: boolean;
  paga?: boolean;
}): boolean {
  if (reg.paga === true) return true;
  if (reg.quitadaDetran === true) return true;
  const s = normStatusDetran(reg.statusInfracao ?? reg.statusDetran);
  return s === "paga";
}

export type SituacaoInfracaoResumida =
  | "Em aberto"
  | "Paga DETRAN"
  | "Paga Lanza"
  | "Advertida"
  | "Justificada";

/** Situação exibida no relatório resumido de infrações (coluna Situação). */
export function situacaoInfracaoResumida(
  reg: {
    statusInfracao?: string;
    statusDetran?: string;
    situacao?: string;
    quitadaDetran?: boolean;
    paga?: boolean;
  },
  opts?: { pagaLanza?: boolean },
): SituacaoInfracaoResumida {
  if (opts?.pagaLanza === true || reg.paga === true) return "Paga Lanza";
  const s = normStatusDetran(reg.statusInfracao ?? reg.statusDetran ?? reg.situacao);
  if (s === "advertida" || s === "advertido") return "Advertida";
  if (s === "justificada") return "Justificada";
  if (infracaoQuitadaDetran(reg)) return "Paga DETRAN";
  return "Em aberto";
}

/**
 * Infração entra na listagem de **despesas em aberto** do relatório de cobranças.
 * Somente cobráveis — pagas/advertidas/quitadas no DETRAN vão em `infracoesPagas`.
 */
export function infracaoIncluirListagemDespesasRelatorio(
  reg: {
    statusInfracao?: string;
    statusDetran?: string;
    situacao?: string;
    quitadaDetran?: boolean;
    paga?: boolean;
    autoInfracao?: string;
  },
  pagasAuto?: Set<string>,
): boolean {
  return infracaoCobravelRelatorio(reg, pagasAuto);
}

/** Infração resolvida (paga/advertida/justificada) — histórico no relatório, fora do total. */
export function infracaoResolvidaRelatorio(
  reg: Parameters<typeof infracaoCobravelRelatorio>[0],
  pagasAuto?: Set<string>,
): boolean {
  return !infracaoCobravelRelatorio(reg, pagasAuto);
}

/**
 * Infração entra na listagem "despesas em aberto" do relatório de cobranças.
 * @deprecated Use {@link infracaoIncluirListagemDespesasRelatorio}
 */
export function infracaoIncluirDespesasEmAbertoRelatorio(
  reg: Parameters<typeof infracaoIncluirListagemDespesasRelatorio>[0],
  pagasAuto?: Set<string>,
): boolean {
  return infracaoIncluirListagemDespesasRelatorio(reg, pagasAuto);
}

/** Infração entra no subtotal cobrável (acerto / total a cobrar). */
export function infracaoCobravelRelatorio(
  reg: {
    statusInfracao?: string;
    statusDetran?: string;
    quitadaDetran?: boolean;
    paga?: boolean;
    autoInfracao?: string;
  },
  pagasAuto?: Set<string>,
): boolean {
  const auto = String(reg.autoInfracao ?? "").trim().toUpperCase();
  if (auto && pagasAuto?.has(auto)) return false;
  if (reg.paga === true) return false;
  if (infracaoNaoCobravelDetran(reg)) return false;
  return true;
}

/** @deprecated Use `infracaoIncluirListagemRelatorio` + `infracaoCobravelRelatorio`. */
export function infracaoOcultaRelatorioCobranca(reg: {
  statusInfracao?: string;
  statusDetran?: string;
  quitadaDetran?: boolean;
}): boolean {
  return !infracaoCobravelRelatorio(reg);
}

function rotuloStatusInfracao(
  reg: RotuloGastoInput & {
    statusInfracao?: string;
    statusDetran?: string;
    quitadaDetran?: boolean;
  },
): string | null {
  const s = normStatusDetran(reg.statusInfracao ?? reg.statusDetran ?? reg.situacao);
  if (s === "advertida" || s === "advertido") return "Advertida";
  if (reg.paga === true || reg.quitadaDetran === true) return "Paga";
  if (s === "paga") return "Paga";
  if (s === "justificada") return "Justificada";
  return null;
}

function anexarStatusRotulo(base: string, status: string | null): string {
  if (!status) return base;
  if (new RegExp(`\\(${status}\\)`, "i").test(base)) return base;
  return `${base} (${status})`;
}

/** Infração convertida em débito (boleto) após vencimento da defesa. */
export function infracaoConvertidaEmDebito(reg: {
  convertidaEmDebito?: boolean;
  dataVencimentoOriginal?: string | null;
}): boolean {
  if (reg.convertidaEmDebito === true) return true;
  return !!String(reg.dataVencimentoOriginal ?? "").trim();
}

/** Débito vencido — base para contabilizar juros/multa DETRAN. */
export function infracaoVencidaParaJuros(
  reg: { dataVencimentoOriginal?: string | null },
  refDate = new Date(),
): boolean {
  const venc = String(reg.dataVencimentoOriginal ?? "").trim();
  if (!venc) return false;
  const m = venc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return false;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  return refDate > dt;
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
  numeroAuto?: string;
  autoInfracao?: string;
  paga?: boolean;
  situacao?: string;
  statusInfracao?: string;
  statusDetran?: string;
  quitadaDetran?: boolean;
};

/** Débito em aberto para cobrança (espelho Gastos Gerais / Rastreame). */
export function gastoClienteEmAberto(reg: RotuloGastoInput): boolean {
  if (reg.paga === true) return false;
  const info = String(reg.descricao ?? "").trim();
  if (/^CR[EÉ]DITO\b/i.test(info) || /^D[EÉ]BITO\b/i.test(info)) return true;
  if (/ATRASADO|ATRSAD/i.test(info)) return true;
  return reg.situacao === "Em aberto";
}

/** Rótulo de infração em relatórios e cobranças — sempre `titulo`, nunca o texto DETRAN em `descricao`. */
export function rotuloInfracaoCobranca(reg: RotuloGastoInput): string {
  const titulo = reg.titulo?.trim();
  const auto = reg.numeroAuto ?? reg.autoInfracao;
  let base = stripAtrasado(
    titulo || tituloInfracaoBase(reg.descricao ?? "", reg.dataAutuacao ?? "", auto),
  );
  if (!base) return "(sem título)";
  const status = rotuloStatusInfracao(reg);
  base = anexarStatusRotulo(base, status);
  if (reg.paga === true) return base;
  if (titulo && /^ATRASADO\s/i.test(titulo) && !status) return titulo;
  if (status) return base;
  return gastoClienteEmAberto(reg) ? `ATRASADO ${base}` : base;
}

/** Rótulo exibido/cobrado — igual ao campo `info` do Rastreame. */
export function rotuloGastoClienteDespesa(reg: RotuloGastoInput): string {
  if (isCategoriaInfracao(reg.categoria)) {
    const auto = reg.numeroAuto ?? reg.autoInfracao;
    const base = stripAtrasado(
      reg.titulo?.trim() ||
        (pareceTituloMulta(reg.descricao ?? "")
          ? reg.descricao ?? ""
          : tituloInfracaoBase(reg.descricao ?? "", reg.dataAutuacao ?? "", auto)),
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
