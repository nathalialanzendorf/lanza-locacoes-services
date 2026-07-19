/**
 * ACT / avisos de irregularidade no SigaPay (Zona Azul Brasil).
 */
import { compactPlaca } from "../placa.js";
import { parsePassagemData } from "../pedagioDigital/passagens.js";
import { SIGAPAY_ORIGIN } from "./auth.js";
import { apiFetchJson, pickArray } from "./client.js";

/** Path configurável — capture no DevTools após login no portal/app. */
const LIST_LOGADO_PATH =
  process.env.SIGAPAY_PATH_AVISOS?.trim() || "/Aviso/list-logado";

export type AvisoStatus = "aberto" | "pago" | "todos";

export type AvisoEstacionamento = {
  /** Identificador único no portal (chave natural do débito). */
  id: string;
  placa: string;
  dataHoraIso: string | null;
  dataHoraRaw: string;
  valor: number;
  /** Cidade/unidade ou endereço do ACT. */
  local: string | null;
  /** true = em aberto / regularizável. */
  emAberto: boolean;
  raw: Record<string, unknown>;
};

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
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
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function inferEmAberto(o: Record<string, unknown>): boolean {
  const txt = pickStr(o, [
    "status",
    "situacao",
    "dsStatus",
    "statusPagamento",
    "stPagamento",
    "situacaoAct",
    "situacaoAviso",
  ]).toLowerCase();
  if (/pago|quitad|liquidad|baixad|regularizad/.test(txt)) return false;
  if (/aberto|pendente|irregular|act|aviso|devedor|nao\s*pago|não\s*pago|atrasad/.test(txt)) {
    return true;
  }
  for (const k of ["pago", "blPago", "isPago", "quitado", "regularizado"]) {
    if (typeof o[k] === "boolean") return !(o[k] as boolean);
  }
  return true;
}

function normalizarAviso(item: unknown): AvisoEstacionamento | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;

  const placa = pickStr(o, [
    "placa",
    "nrPlaca",
    "nuPlaca",
    "dsPlaca",
    "placaVeiculo",
    "plate",
  ]);
  const id =
    pickStr(o, [
      "id",
      "idAviso",
      "idAct",
      "idIrregularidade",
      "idTransacao",
      "nrTransacao",
      "codigo",
      "protocolo",
      "uuid",
      "numeroAct",
    ]) || "";

  const dataHoraRaw = pickStr(o, [
    "dataHora",
    "dataHoraAviso",
    "dataHoraAct",
    "dtAviso",
    "data",
    "dtIrregularidade",
    "dataIrregularidade",
    "dataAutuacao",
  ]);

  const valor = parseValor(
    o.valor ??
      o.vlAviso ??
      o.vlAct ??
      o.valorRegularizacao ??
      o.valorTarifa ??
      o.total ??
      o.vlTotal,
  );

  const local =
    pickStr(o, [
      "cidade",
      "municipio",
      "unidade",
      "dsUnidade",
      "local",
      "endereco",
      "logradouro",
      "bairro",
    ]) || null;

  const dataHoraIso = parsePassagemData(dataHoraRaw);

  const key =
    id ||
    [
      compactPlaca(placa),
      (dataHoraIso ?? dataHoraRaw).replace(/\D/g, ""),
      Math.round(valor * 100),
    ]
      .filter(Boolean)
      .join("-");
  if (!key || !placa) return null;

  return {
    id: key,
    placa,
    dataHoraIso,
    dataHoraRaw,
    valor,
    local,
    emAberto: inferEmAberto(o),
    raw: o,
  };
}

/** Extrai e normaliza avisos de um payload já obtido (offline/debug). */
export function extrairAvisos(raw: unknown): AvisoEstacionamento[] {
  const arr = pickArray(raw, [
    "itens",
    "avisos",
    "acts",
    "irregularidades",
    "avisoCobranca",
    "items",
    "data",
  ]);
  return arr.map(normalizarAviso).filter((a): a is AvisoEstacionamento => a !== null);
}

export function filtrarStatusAviso(
  avisos: AvisoEstacionamento[],
  status: AvisoStatus,
): AvisoEstacionamento[] {
  if (status === "aberto") return avisos.filter((a) => a.emAberto);
  if (status === "pago") return avisos.filter((a) => !a.emAberto);
  return avisos;
}

/**
 * Consulta avisos/ACT de várias placas numa única chamada.
 * Configure `SIGAPAY_PATH_AVISOS` após capturar o endpoint real no DevTools.
 */
export async function listarAvisosLote(
  placas: string[],
  opts: { status?: AvisoStatus } = {},
): Promise<AvisoEstacionamento[]> {
  const compactas = [...new Set(placas.map(compactPlaca).filter(Boolean))];
  if (compactas.length === 0) return [];

  const session = await import("./auth.js").then((m) => m.getSigapaySession());
  if (!session?.cookie && !session?.token) {
    throw new Error(
      "SigaPay sem sessão: defina SIGAPAY_COOKIE + SIGAPAY_TOKEN (DevTools) ou use sync --json arquivo.json offline.",
    );
  }

  const raw = await apiFetchJson(LIST_LOGADO_PATH, {
    query: { placas: compactas.join(",") },
    referer: `${SIGAPAY_ORIGIN}/`,
  });
  return filtrarStatusAviso(extrairAvisos(raw), opts.status ?? "todos");
}

/** Consulta avisos de uma placa. */
export async function listarAvisos(
  placa: string,
  opts: { status?: AvisoStatus } = {},
): Promise<AvisoEstacionamento[]> {
  const alvo = compactPlaca(placa);
  const todas = await listarAvisosLote([placa], opts);
  return todas.filter((a) => compactPlaca(a.placa) === alvo);
}
