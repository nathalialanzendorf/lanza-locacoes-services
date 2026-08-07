import WebSocket from "ws";

export function cdpKeepOpen(): boolean {
  return process.argv.includes("--keep-open") || process.env.CDP_KEEP_OPEN === "1";
}

/** Fecha o Chrome ligado ao CDP na porta indicada (Browser.close). */
export async function fecharChromeCdp(port: number, keepOpen = cdpKeepOpen()): Promise<void> {
  if (keepOpen) {
    console.log("Chrome mantido aberto (--keep-open / CDP_KEEP_OPEN=1).");
    return;
  }
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!r.ok) return;
    const j = (await r.json()) as { webSocketDebuggerUrl?: string };
    if (!j.webSocketDebuggerUrl) return;

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(j.webSocketDebuggerUrl!);
      const done = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve();
      };
      ws.on("open", () => {
        ws.send(JSON.stringify({ id: 1, method: "Browser.close", params: {} }));
        setTimeout(done, 600);
      });
      ws.on("error", done);
      setTimeout(done, 2000);
    });
    console.log("Chrome fechado automaticamente.");
  } catch {
    console.log("Nao foi possivel fechar o Chrome via CDP — feche a janela manualmente.");
  }
}
