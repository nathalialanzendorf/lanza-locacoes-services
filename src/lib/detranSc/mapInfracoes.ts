import type {
  DetranScConsultaVeiculo,
  DetranScDebito,
  DetranScInfracao,
  DetranScMultaNormalizada,
  StatusInfracaoDetran,
} from "./types.js";

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

function parseValor(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = String(v ?? "")
    .replace(/R\$\s*/i, "")
    .trim();
  if (!s) return 0;
  const n = s.includes(",")
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function formatDataHora(data: string, hora?: string): string {
  const d = data.trim();
  if (!d) return "";
  if (/\d{2}:\d{2}/.test(d)) return d;
  const h = (hora ?? "").trim();
  return h ? `${d} ${h}` : d;
}

/** Converte ISO (YYYY-MM-DD) ou mantém DD/MM/AAAA. */
export function paraDataBr(s: string): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return t;
}

function extrairAuto(item: DetranScInfracao | DetranScDebito): string {
  return pickStr(item as Record<string, unknown>, [
    "numeroAuto",
    "numAuto",
    "autoInfracao",
    "numeroAutoInfracao",
    "auto",
  ]);
}

function parseDataBrToDate(dataBr: string): Date | null {
  const m = String(dataBr ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Prazo de defesa vencido → infração convertida em débito no DETRAN. */
export function defesaVencida(dataLimiteDefesa: string, refDate = new Date()): boolean {
  const dt = parseDataBrToDate(paraDataBr(dataLimiteDefesa));
  if (!dt) return false;
  return refDate > dt;
}

/**
 * Classifica o status bruto do DETRAN nos valores do portal e nas regras Lanza.
 */
export function normalizarStatusInfracao(
  situacaoRaw: string,
  statusPortalRaw: string,
  quitadaDetranBase: boolean,
  fonte: DetranScMultaNormalizada["fonte"],
): {
  statusInfracao: StatusInfracaoDetran;
  statusDetran?: string;
  quitadaDetran: boolean;
} {
  // O portal usa `status` (Advertida/Paga/Justificada) distinto de `situacao`
  // (ex.: "Penalidade notificada" no histórico). `status` prevalece.
  const portal = statusPortalRaw.trim().toLowerCase();
  if (portal === "advertida" || portal === "advertido") {
    return { statusInfracao: "Advertida", statusDetran: "advertida", quitadaDetran: false };
  }
  if (portal === "paga") {
    return { statusInfracao: "Paga", statusDetran: "paga", quitadaDetran: true };
  }
  if (portal === "justificada") {
    return { statusInfracao: "Justificada", statusDetran: "justificada", quitadaDetran: false };
  }

  const s = situacaoRaw.trim().toLowerCase();
  if (s === "advertida" || s === "advertido") {
    return { statusInfracao: "Advertida", statusDetran: "advertida", quitadaDetran: false };
  }
  if (s === "paga") {
    return { statusInfracao: "Paga", statusDetran: "paga", quitadaDetran: true };
  }
  if (s === "justificada") {
    return { statusInfracao: "Justificada", statusDetran: "justificada", quitadaDetran: false };
  }
  if (s === "notificada") {
    return { statusInfracao: "Notificada", quitadaDetran: quitadaDetranBase };
  }
  if (quitadaDetranBase || fonte === "historicoInfracoes") {
    return { statusInfracao: "Paga", statusDetran: "paga", quitadaDetran: true };
  }
  return { statusInfracao: "Notificada", quitadaDetran: quitadaDetranBase };
}

function normalizarInfracao(
  item: DetranScInfracao,
  fonte: DetranScMultaNormalizada["fonte"],
  quitadaDetranBase: boolean,
): DetranScMultaNormalizada | null {
  const autoInfracao = extrairAuto(item);
  if (!autoInfracao) return null;

  const data = pickStr(item as Record<string, unknown>, ["data", "dataAutuacao"]);
  const hora = pickStr(item as Record<string, unknown>, ["hora"]);
  const localDataHora = pickStr(item as Record<string, unknown>, [
    "localDataHoraMulta",
    "dataHora",
  ]);

  let dataAutuacao = localDataHora;
  if (!dataAutuacao) dataAutuacao = formatDataHora(data, hora);

  const descricao = pickStr(item as Record<string, unknown>, [
    "descricao",
    "infracaoDescricao",
    "detalhamento",
  ]);

  const localInfracao = pickStr(item as Record<string, unknown>, [
    "localComplemento",
    "localInfracao",
    "endereco",
    "local",
  ]);

  const situacaoRaw = pickStr(item as Record<string, unknown>, ["situacao"]);
  const statusPortalRaw = pickStr(item as Record<string, unknown>, ["status"]);
  const dataLimiteDefesa = paraDataBr(
    pickStr(item as Record<string, unknown>, [
      "dataLimiteDefesa",
      "limiteDefesa",
      "prazoDefesa",
    ]),
  );

  const valorMulta = parseValor(
    item.valorMulta ?? item.valor ?? (item as Record<string, unknown>).valorAtual,
  );

  const { statusInfracao, statusDetran, quitadaDetran } = normalizarStatusInfracao(
    situacaoRaw,
    statusPortalRaw,
    quitadaDetranBase,
    fonte,
  );

  const convertidaEmDebito =
    statusInfracao === "Notificada" && defesaVencida(dataLimiteDefesa);

  return {
    autoInfracao,
    numeroAuto: autoInfracao,
    descricao: descricao || "(sem descrição)",
    localInfracao,
    dataAutuacao,
    valorMulta,
    situacao: situacaoRaw || statusInfracao,
    limiteDefesa: dataLimiteDefesa,
    dataLimiteDefesa,
    dataVencimentoOriginal: "",
    convertidaEmDebito,
    quitadaDetran,
    statusInfracao,
    statusDetran,
    fonte,
  };
}

/** Débitos de licenciamento, IPVA etc. — responsabilidade do parceiro/dono, não do locatário. */
export function isDebitoProprietario(d: DetranScDebito): boolean {
  const texto = [
    d.classe,
    d.descricao,
    d.tipo,
    (d as Record<string, unknown>).nome,
    (d as Record<string, unknown>).titulo,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  if (!texto.trim()) return false;

  return (
    /licenciamento|ipva|dpvat|seguro\s*obrig|taxa\s*detran|crlv|recadastro|transferencia|divida\s*ativa/.test(
      texto,
    ) && !/multa|infracao|penalidade|autuacao/.test(texto)
  );
}

/** Multa com boleto gerado mas ainda não paga (dentro de debitos). */
export function isDebitoMulta(d: DetranScDebito): boolean {
  if (isDebitoProprietario(d)) return false;
  if (extrairAuto(d)) return true;

  const texto = [d.classe, d.descricao, d.tipo]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  return /multa|infracao|penalidade|autuacao|auto\s*de\s*infra/.test(texto);
}

function normalizarDebitoMulta(d: DetranScDebito): DetranScMultaNormalizada | null {
  const autoInfracao = extrairAuto(d);
  if (!autoInfracao && !isDebitoMulta(d)) return null;

  const descricao =
    pickStr(d as Record<string, unknown>, ["descricao", "classe", "tipo"]) ||
    "Multa (débito DETRAN)";

  const valorMulta = parseValor(d.valorAtual ?? d.valor);
  const dataVencimentoOriginal = paraDataBr(
    pickStr(d as Record<string, unknown>, [
      "dataVencimentoOriginal",
      "vencimento",
      "dataVencimento",
    ]),
  );

  const resolvedAuto =
    autoInfracao || `DETRAN-${pickStr(d as Record<string, unknown>, ["numeroDetranNET"])}`;

  return {
    autoInfracao: resolvedAuto,
    numeroAuto: autoInfracao || resolvedAuto,
    descricao,
    localInfracao: "",
    dataAutuacao: "",
    valorMulta,
    situacao: "BOLETO EM ABERTO",
    limiteDefesa: dataVencimentoOriginal,
    dataLimiteDefesa: "",
    dataVencimentoOriginal,
    convertidaEmDebito: true,
    quitadaDetran: false,
    statusInfracao: "Notificada",
    fonte: "debitos",
  };
}

/** Mescla autuação (`infracoes`) com débito (`debitos`) do mesmo `numeroAuto`. */
export function mesclarMultaDetran(
  base: DetranScMultaNormalizada,
  extra: DetranScMultaNormalizada,
): DetranScMultaNormalizada {
  const merged: DetranScMultaNormalizada = { ...base };

  if (extra.fonte === "debitos") {
    merged.convertidaEmDebito = true;
    if (extra.dataVencimentoOriginal) {
      merged.dataVencimentoOriginal = extra.dataVencimentoOriginal;
      merged.limiteDefesa = extra.dataVencimentoOriginal;
    }
    if (extra.valorMulta > 0) merged.valorMulta = extra.valorMulta;
    if (extra.situacao) merged.situacao = extra.situacao;
  }

  if (!merged.dataLimiteDefesa && extra.dataLimiteDefesa) {
    merged.dataLimiteDefesa = extra.dataLimiteDefesa;
    if (!merged.limiteDefesa) merged.limiteDefesa = extra.dataLimiteDefesa;
  }

  if (
    merged.statusInfracao === "Notificada" &&
    defesaVencida(merged.dataLimiteDefesa) &&
    !merged.dataVencimentoOriginal &&
    extra.dataVencimentoOriginal
  ) {
    merged.convertidaEmDebito = true;
  }

  return merged;
}

function unwrapPayload(raw: unknown): DetranScConsultaVeiculo {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;

  const nested = [o.data, o.veiculo, o.resultado, o.payload, o.content].find(
    (x) => x && typeof x === "object",
  ) as DetranScConsultaVeiculo | undefined;

  if (nested && (nested.infracoes || nested.historicoInfracoes || nested.debitos)) {
    return nested;
  }
  return o as DetranScConsultaVeiculo;
}

/**
 * Extrai multas cobráveis e histórico conforme regras Lanza:
 * - infracoes: autuações notificadas sem boleto (cobrável locatário)
 * - debitos: multas em aberto → infracoes.json; IPVA/licenciamento → parceiro-despesas (syncDespesasVeiculo)
 * - historicoInfracoes: quitadas no DETRAN (não cobrar locatário)
 * - mesmo numeroAuto em infracoes + debitos → registro único mesclado
 */
export function extrairMultasDetranSc(raw: unknown): {
  cobraveis: DetranScMultaNormalizada[];
  historico: DetranScMultaNormalizada[];
  debitosIgnoradosProprietario: number;
} {
  const payload = unwrapPayload(raw);
  const cobraveisMap = new Map<string, DetranScMultaNormalizada>();
  const historicoMap = new Map<string, DetranScMultaNormalizada>();
  let debitosIgnoradosProprietario = 0;

  function pushMap(
    map: Map<string, DetranScMultaNormalizada>,
    item: DetranScMultaNormalizada | null,
  ): void {
    if (!item) return;
    const key = item.autoInfracao.trim().toUpperCase();
    if (!key) return;
    const existing = map.get(key);
    map.set(key, existing ? mesclarMultaDetran(existing, item) : item);
  }

  for (const inf of payload.infracoes ?? []) {
    const situacaoInf = pickStr(inf as Record<string, unknown>, ["situacao", "status"])
      .trim()
      .toLowerCase();
    const isPaga = situacaoInf === "paga";
    pushMap(
      isPaga ? historicoMap : cobraveisMap,
      normalizarInfracao(inf, "infracoes", isPaga),
    );
  }

  for (const d of payload.debitos ?? []) {
    if (isDebitoProprietario(d)) {
      debitosIgnoradosProprietario++;
      continue;
    }
    if (isDebitoMulta(d)) {
      const norm = normalizarDebitoMulta(d);
      if (!norm) continue;
      const key = norm.autoInfracao.trim().toUpperCase();
      if (cobraveisMap.has(key)) {
        pushMap(cobraveisMap, norm);
      } else {
        pushMap(cobraveisMap, norm);
      }
    }
  }

  for (const inf of payload.historicoInfracoes ?? []) {
    pushMap(historicoMap, normalizarInfracao(inf, "historicoInfracoes", true));
  }

  return {
    cobraveis: [...cobraveisMap.values()],
    historico: [...historicoMap.values()],
    debitosIgnoradosProprietario,
  };
}
