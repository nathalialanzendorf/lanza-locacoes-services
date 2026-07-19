import { loadClienteDespesasDb, loadClienteDespesasDbAsync } from "./clienteDespesasDb.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { loadVeiculosDb, loadVeiculosDbAsync, saveVeiculosDb, saveVeiculosDbAsync } from "./veiculosDb.js";

/**
 * Categorias que indicam que o veículo já estava em locação (posse de um
 * locatário). A data mais antiga entre elas é o "início das locações".
 */
const CATEGORIAS_LOCACAO = new Set([
  "Locação semanal",
  "Caução",
  "Diária",
  "Renegociação",
  "Quebra contrato",
]);

type VeiculoRow = {
  placa?: string;
  inicioLocacoes?: string | null;
  ativo?: boolean;
  [k: string]: unknown;
};

type VeiculosDb = {
  veiculos?: VeiculoRow[];
  [k: string]: unknown;
};

/** Aceita "YYYY-MM-DD", "DD/MM/AAAA" ou "DD/MM/AAAA HH:mm". Retorna Date (00:00). */
export function parseDataInicio(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadVeiculosDbLocal(): VeiculosDb {
  return loadVeiculosDb() as VeiculosDb;
}

/** Mapa placaNormalizada -> Date de início das locações (campo inicioLocacoes). */
export function loadInicioLocacoesMap(): Map<string, Date> {
  const db = loadVeiculosDbLocal();
  const map = new Map<string, Date>();
  for (const v of db.veiculos ?? []) {
    if (!v.placa) continue;
    const dt = parseDataInicio(v.inicioLocacoes ?? null);
    if (dt) map.set(compactPlaca(v.placa), dt);
  }
  return map;
}

export function getInicioLocacoes(placa: string): Date | null {
  return loadInicioLocacoesMap().get(compactPlaca(placa)) ?? null;
}

/**
 * Deriva o início das locações de cada placa a partir do registro de locação
 * mais antigo em cliente-despesas.json (categorias de posse do locatário).
 */
export function derivarInicioLocacoes(): Map<string, string> {
  return derivarInicioLocacoesFromDespesas(loadClienteDespesasDb().clienteDespesas);
}

export async function derivarInicioLocacoesAsync(): Promise<Map<string, string>> {
  const db = await loadClienteDespesasDbAsync();
  return derivarInicioLocacoesFromDespesas(db.clienteDespesas);
}

function derivarInicioLocacoesFromDespesas(
  despesas: Array<{ veiculoId?: string; categoria?: string; dataAutuacao?: string; ativo?: boolean }>,
): Map<string, string> {
  const db = { clienteDespesas: despesas };
  const minPorPlaca = new Map<string, Date>();
  for (const d of db.clienteDespesas ?? []) {
    if (d.ativo === false) continue;
    const cat = d.categoria ?? "Infração";
    if (!CATEGORIAS_LOCACAO.has(cat)) continue;
    if (!d.veiculoId) continue;
    const dt = parseDataInicio(d.dataAutuacao);
    if (!dt) continue;
    const key = compactPlaca(d.veiculoId);
    const cur = minPorPlaca.get(key);
    if (!cur || dt < cur) minPorPlaca.set(key, dt);
  }
  const out = new Map<string, string>();
  for (const [placa, dt] of minPorPlaca) out.set(placa, toIso(dt));
  return out;
}

export type GravarInicioResult = {
  placa: string;
  inicio: string;
  acao: "definido" | "atualizado" | "mantido" | "sem-dados";
};

/**
 * Grava o início derivado em veiculos.json.
 * - sobrescrever=false (default): só preenche quem está vazio.
 * - sobrescrever=true: substitui o valor existente pelo derivado.
 */
export function gravarInicioLocacoesDerivado(opts?: {
  sobrescrever?: boolean;
  dryRun?: boolean;
}): GravarInicioResult[] {
  return gravarInicioLocacoesDerivadoComDados(
    derivarInicioLocacoes(),
    loadVeiculosDb(),
    opts,
  );
}

export async function gravarInicioLocacoesDerivadoAsync(opts?: {
  sobrescrever?: boolean;
  dryRun?: boolean;
}): Promise<GravarInicioResult[]> {
  const sobrescrever = opts?.sobrescrever === true;
  const [derivado, db] = await Promise.all([derivarInicioLocacoesAsync(), loadVeiculosDbAsync()]);
  const out: GravarInicioResult[] = [];

  for (const v of db.veiculos ?? []) {
    if (!v.placa) continue;
    const key = compactPlaca(v.placa);
    const novo = derivado.get(key);
    const atual = v.inicioLocacoes != null ? String(v.inicioLocacoes) : null;

    if (!novo) {
      out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: atual ?? "", acao: "sem-dados" });
      continue;
    }
    if (atual && !sobrescrever) {
      out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: atual, acao: "mantido" });
      continue;
    }
    const acao: GravarInicioResult["acao"] = atual ? "atualizado" : "definido";
    if (opts?.dryRun !== true) v.inicioLocacoes = novo;
    out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: novo, acao });
  }

  if (opts?.dryRun !== true) {
    db.atualizadoEm = new Date().toISOString();
    await saveVeiculosDbAsync(db);
  }
  return out;
}

function gravarInicioLocacoesDerivadoComDados(
  derivado: Map<string, string>,
  db: ReturnType<typeof loadVeiculosDb>,
  opts?: { sobrescrever?: boolean; dryRun?: boolean },
): GravarInicioResult[] {
  const sobrescrever = opts?.sobrescrever === true;
  const out: GravarInicioResult[] = [];

  for (const v of db.veiculos ?? []) {
    if (!v.placa) continue;
    const key = compactPlaca(v.placa);
    const novo = derivado.get(key);
    const atual = v.inicioLocacoes != null ? String(v.inicioLocacoes) : null;

    if (!novo) {
      out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: atual ?? "", acao: "sem-dados" });
      continue;
    }
    if (atual && !sobrescrever) {
      out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: atual, acao: "mantido" });
      continue;
    }
    const acao: GravarInicioResult["acao"] = atual ? "atualizado" : "definido";
    if (opts?.dryRun !== true) v.inicioLocacoes = novo;
    out.push({ placa: formatPlacaHyphen(String(v.placa)), inicio: novo, acao });
  }

  if (opts?.dryRun !== true) {
    db.atualizadoEm = new Date().toISOString();
    saveVeiculosDb(db);
  }
  return out;
}
