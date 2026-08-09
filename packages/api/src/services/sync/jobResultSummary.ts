type PortalSecao = {
  error?: string;
  avisos?: string[];
};

type SyncItem = {
  placa?: string;
  avisos?: string[];
};

function collectSecaoMessages(secao: PortalSecao | undefined): string[] {
  if (!secao) return [];
  const msgs: string[] = [];
  if (secao.error?.trim()) msgs.push(secao.error.trim());
  if (secao.avisos?.length) msgs.push(...secao.avisos.filter(Boolean));
  return msgs;
}

function collectItemAvisos(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const lines: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as SyncItem;
    if (!item.avisos?.length) continue;
    for (const aviso of item.avisos) {
      if (!aviso) continue;
      lines.push(item.placa ? `${item.placa}: ${aviso}` : aviso);
    }
  }
  return lines;
}

/** Resumo legível quando o job conclui com falhas parciais (consulta portais, sync frota). */
export function summarizeSyncJobResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const lines: string[] = [];

  for (const key of ["detranSc", "detranRs", "pedagio", "estacionamento"]) {
    lines.push(...collectSecaoMessages(r[key] as PortalSecao | undefined));
  }

  lines.push(...collectItemAvisos(r.items));

  const resultado = r.resultado;
  if (resultado && typeof resultado === "object") {
    const res = resultado as { error?: string; avisos?: string[] };
    if (res.error?.trim()) lines.push(res.error.trim());
    if (res.avisos?.length) lines.push(...res.avisos.filter(Boolean));
  }

  const unique = [...new Set(lines.map((l) => l.trim()).filter(Boolean))];
  if (!unique.length) return undefined;

  const max = 5;
  const head = unique.slice(0, max).join(" · ");
  return unique.length > max ? `${head} · (+${unique.length - max} mais)` : head;
}
