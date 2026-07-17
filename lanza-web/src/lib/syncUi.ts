import type { SyncCatalogEntry, SyncDirecao } from "@/api/types";

/** Syncs Rastreame que só enviam (fallback se a API não enviar `direcao`). */
const ENVIAR_SYNC_IDS = new Set([
  "motoristas",
  "rastreaveis-enviar",
  "recebimentos",
  "manutencao",
]);

export function direcaoEfetiva(sync: SyncCatalogEntry): SyncDirecao {
  if (sync.direcao === "enviar" || sync.direcao === "buscar") return sync.direcao;
  return ENVIAR_SYNC_IDS.has(sync.id) ? "enviar" : "buscar";
}

const BUSCAR_ORDEM = [
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "rastreaveis",
  "fipe",
  "seguro",
] as const;

const ENVIAR_ORDEM = ["motoristas", "rastreaveis-enviar", "recebimentos", "manutencao"] as const;

export function ordenarSyncsPorDirecao(
  syncs: SyncCatalogEntry[],
  direcao: "buscar" | "enviar",
): SyncCatalogEntry[] {
  const ordem = direcao === "buscar" ? BUSCAR_ORDEM : ENVIAR_ORDEM;
  const filtrados = syncs.filter((s) => direcaoEfetiva(s) === direcao);
  const map = new Map(filtrados.map((s) => [s.id, s]));
  const ordered: SyncCatalogEntry[] = [];
  for (const id of ordem) {
    const item = map.get(id);
    if (item) ordered.push(item);
  }
  for (const s of filtrados) {
    if (!ordered.some((o) => o.id === s.id)) ordered.push(s);
  }
  return ordered;
}

export function bodySyncGlobal(opts: { dryRun: boolean; placa: string }): Record<string, unknown> {
  return {
    dryRun: opts.dryRun,
    placa: opts.placa.trim() || undefined,
  };
}

export function opcoesSyncCompleto(
  syncs: SyncCatalogEntry[],
  opts: { dryRun: boolean; placa: string },
): Record<string, Record<string, unknown>> {
  const base = bodySyncGlobal(opts);
  return Object.fromEntries(syncs.map((s) => [s.id, { ...base }]));
}
