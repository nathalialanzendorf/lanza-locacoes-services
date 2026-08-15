/**
 * Fecha instâncias Chrome de captura (portas CDP 9223–9227).
 *
 *   npm run capture-cdp-stop
 */
import { fecharChromeCdp } from "../src/lib/cdp/fecharChromeCdp.js";

const CDP_PORTS = [
  { port: 9223, label: "DETRAN SC" },
  { port: 9224, label: "SigaPay" },
  { port: 9225, label: "Pedágio" },
  { port: 9227, label: "DETRAN RS" },
];

console.log("A fechar Chrome CDP de captura…\n");

for (const { port, label } of CDP_PORTS) {
  const up = await fetch(`http://127.0.0.1:${port}/json/version`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) {
    console.log(`  CDP ${port} (${label}): livre`);
    continue;
  }
  console.log(`  CDP ${port} (${label}): a fechar…`);
  await fecharChromeCdp(port, false);
}

console.log("\nConcluído. Rode: npm run capture-bridges-all");
