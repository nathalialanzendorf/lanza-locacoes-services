/**
 * Helpers CDP partilhados: verificar se a porta de debug pertence ao portal esperado.
 */
type TabTarget = {
  type: string;
  url?: string;
};

export type PortalChromeInfo = {
  wsUrl?: string;
  /** DevTools activo mas com abas de outro portal (porta em conflito). */
  wrongPortal: boolean;
};

/** DevTools activo e browser WS URL, validando que não é outro portal na mesma porta. */
export async function obterBrowserWsPortal(
  port: number,
  portalHostRe: RegExp,
): Promise<PortalChromeInfo> {
  try {
    const ver = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!ver.ok) return { wrongPortal: false };
    const j = (await ver.json()) as { webSocketDebuggerUrl?: string };
    const wsUrl = j.webSocketDebuggerUrl;

    const list = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!list.ok) return { wsUrl, wrongPortal: false };

    const tabs = (await list.json()) as TabTarget[];
    const pages = tabs.filter((t) => t.type === "page");
    const hasPortal = pages.some((t) => portalHostRe.test(t.url ?? ""));
    const hasOtherSite = pages.some((t) => {
      const u = t.url ?? "";
      if (!u.startsWith("http")) return false;
      return !portalHostRe.test(u);
    });

    if (hasOtherSite && !hasPortal) {
      return { wsUrl, wrongPortal: true };
    }
    return { wsUrl, wrongPortal: false };
  } catch {
    return { wrongPortal: false };
  }
}
