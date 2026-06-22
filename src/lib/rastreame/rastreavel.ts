/**
 * API /keek/rest/rastreavel — listagem (mesmo padrão que motorista).
 */
import { RASTREAME_ORIGIN, rastreameJsonHeaders } from "./auth.js";

const RASTREAVEL_BASE = `${RASTREAME_ORIGIN}/keek/rest/rastreavel`;

export type Rastreavel = {
  key?: string;
  value?: string;
  ativo?: boolean;
};

export async function listRastreaveis(): Promise<Rastreavel[]> {
  const r = await fetch(`${RASTREAVEL_BASE}?ativo=true&size=2000`, {
    headers: await rastreameJsonHeaders(false),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`rastreavel list HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const d = (await r.json()) as { content?: Rastreavel[] } | Rastreavel[];
  if (Array.isArray(d)) return d;
  return d.content ?? [];
}
