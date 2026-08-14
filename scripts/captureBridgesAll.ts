/**
 * Sobe os quatro bridges de captura de sessão (DETRAN SC/RS, Pedágio, SigaPay).
 *
 *   npm run capture-bridges-all
 *
 * Portas padrão: 9234 (SC), 9235 (SigaPay), 9236 (Pedágio), 9237 (RS).
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BRIDGES = [
  { name: "DETRAN SC", port: 9234, script: "detran-capture-bridge" },
  { name: "SigaPay", port: 9235, script: "sigapay-capture-bridge" },
  { name: "Pedágio Digital", port: 9236, script: "pedagio-capture-bridge" },
  { name: "DETRAN RS", port: 9237, script: "detran-rs-capture-bridge" },
] as const;

console.log("Bridges de captura — Ctrl+C encerra todos\n");

const children: ChildProcess[] = [];

for (const { name, port, script } of BRIDGES) {
  console.log(`  • ${name.padEnd(18)} http://127.0.0.1:${port}  (npm run ${script})`);
  const child = spawn("npm", ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  child.on("exit", (code, signal) => {
    if (signal) return;
    console.error(`[${name}] bridge encerrou (código ${code ?? "?"})`);
  });
  children.push(child);
}

console.log("\nAguardando pedidos da app (Sync → Capturar sessão)…\n");

function shutdown() {
  console.log("\nEncerrando bridges…");
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
