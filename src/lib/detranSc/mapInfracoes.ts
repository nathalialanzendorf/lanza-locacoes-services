import type {
  DetranScConsultaVeiculo,
  DetranScDebito,
  DetranScInfracao,
  DetranScMultaNormalizada,
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

function extrairAuto(item: DetranScInfracao | DetranScDebito): string {
  return pickStr(item as Record<string, unknown>, [
    "numeroAuto",
    "numAuto",
    "autoInfracao",
    "numeroAutoInfracao",
    "auto",
  ]);
}

function normalizarInfracao(
  item: DetranScInfracao,
  fonte: DetranScMultaNormalizada["fonte"],
  quitadaDetran: boolean,
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

  const situacao = pickStr(item as Record<string, unknown>, ["situacao", "status"]);
  const limiteDefesa = pickStr(item as Record<string, unknown>, [
    "limiteDefesa",
    "dataLimiteDefesa",
    "prazoDefesa",
  ]);

  const valorMulta = parseValor(
    item.valorMulta ?? item.valor ?? (item as Record<string, unknown>).valorAtual,
  );

  return {
    autoInfracao,
    descricao: descricao || "(sem descrição)",
    localInfracao,
    dataAutuacao,
    valorMulta,
    situacao: situacao || (quitadaDetran ? "QUITADA DETRAN" : "NOTIFICADA"),
    limiteDefesa,
    quitadaDetran,
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
  const vencimento = pickStr(d as Record<string, unknown>, ["vencimento"]);

  return {
    autoInfracao: autoInfracao || `DETRAN-${pickStr(d as Record<string, unknown>, ["numeroDetranNET"])}`,
    descricao,
    localInfracao: "",
    dataAutuacao: "",
    valorMulta,
    situacao: "BOLETO EM ABERTO",
    limiteDefesa: vencimento,
    quitadaDetran: false,
    fonte: "debitos",
  };
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
 * - debitos: só multas em aberto; ignora licenciamento/IPVA (parceiro)
 * - historicoInfracoes: quitadas no DETRAN (não cobrar locatário)
 */
export function extrairMultasDetranSc(raw: unknown): {
  cobraveis: DetranScMultaNormalizada[];
  historico: DetranScMultaNormalizada[];
  debitosIgnoradosProprietario: number;
} {
  const payload = unwrapPayload(raw);
  const cobraveis: DetranScMultaNormalizada[] = [];
  const historico: DetranScMultaNormalizada[] = [];
  let debitosIgnoradosProprietario = 0;

  const seen = new Set<string>();

  function push(
    list: DetranScMultaNormalizada[],
    item: DetranScMultaNormalizada | null,
  ): void {
    if (!item) return;
    const key = item.autoInfracao.trim().toUpperCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(item);
  }

  for (const inf of payload.infracoes ?? []) {
    push(cobraveis, normalizarInfracao(inf, "infracoes", false));
  }

  for (const d of payload.debitos ?? []) {
    if (isDebitoProprietario(d)) {
      debitosIgnoradosProprietario++;
      continue;
    }
    if (isDebitoMulta(d)) {
      push(cobraveis, normalizarDebitoMulta(d));
    }
  }

  for (const inf of payload.historicoInfracoes ?? []) {
    push(historico, normalizarInfracao(inf, "historicoInfracoes", true));
  }

  return { cobraveis, historico, debitosIgnoradosProprietario };
}
