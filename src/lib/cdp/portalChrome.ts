/**
 * Helpers CDP partilhados: verificar se a porta de debug pertence ao portal esperado.
 */
import WebSocket from "ws";

export type CdpTab = {
  type: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type TabTarget = CdpTab;

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

export async function listarAbasCdp(port: number): Promise<CdpTab[]> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!r.ok) return [];
    const tabs = (await r.json()) as CdpTab[];
    return tabs.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

/** Navega a primeira aba útil para o portal (reutilizar Chrome CDP já aberto). */
export async function navegarPrimeiraAbaCdp(port: number, url: string): Promise<void> {
  const tabs = await listarAbasCdp(port);
  const tab = tabs.find((t) => t.url && t.url !== "about:blank") ?? tabs[0];
  if (!tab?.webSocketDebuggerUrl) return;

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(tab.webSocketDebuggerUrl!);
    socket.on("open", () => {
      socket.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url } }));
    });
    socket.on("error", reject);
    setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, 800);
  });
}

/** Abre nova aba no browser CDP (melhor para login Gov.br em modal). */
export async function abrirAbaPortalCdp(browserWsUrl: string, url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(browserWsUrl);
    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Target.createTarget",
          params: { url, newWindow: false, background: false },
        }),
      );
    });
    socket.on("error", reject);
    setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve();
    }, 1200);
  });
}

/** Chrome flags comuns para portais com login Gov.br (pop-up / iframe). */
export const CHROME_PORTAL_ARGS = [
  "--remote-allow-origins=*",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-popup-blocking",
  "--disable-blink-features=AutomationControlled",
] as const;

