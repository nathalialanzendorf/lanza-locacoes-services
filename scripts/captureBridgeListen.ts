import type { Server } from "node:http";

export function listenCaptureBridge(
  server: Server,
  port: number,
  host: string,
  label: string,
  onReady: () => void,
): void {
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[${label}] Porta ${port} já em uso (bridge antigo a correr).`);
      console.error("  Encerre com: npm run capture-bridges-stop");
      console.error("  Depois:       npm run capture-bridges-all");
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, host, onReady);
}
