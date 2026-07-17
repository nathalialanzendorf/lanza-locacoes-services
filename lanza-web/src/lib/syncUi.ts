import type { SyncCatalogEntry } from "@/api/types";

const BUSCAR_ORDEM = [
  "pedagios",
  "infracoes",
  "ipva-licenciamento",
  "detran-rs",
  "rastreaveis",
  "fipe",
  "seguro",
] as const;

const ENVIAR_ORDEM = ["motoristas", "recebimentos", "manutencao"] as const;

export function ordenarSyncsPorDirecao(
  syncs: SyncCatalogEntry[],
  direcao: "buscar" | "enviar",
): SyncCatalogEntry[] {
  const ordem = direcao === "buscar" ? BUSCAR_ORDEM : ENVIAR_ORDEM;
  const filtrados = syncs.filter((s) => (s.direcao ?? "buscar") === direcao);
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
