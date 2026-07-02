/**
 * Sincroniza motoristas (Rastreame) ↔ database/clientes.json.
 *
 * Uso:
 *   npx tsx src/run.ts sync-motoristas [--dry-run] [--pull-only] [--push-only] [--force-pull] [--force-push]
 */
import { syncMotoristas } from "../lib/rastreame/motoristasSync.js";

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`Uso:
  sync-motoristas [opções]

Opções:
  --dry-run      Simula sem gravar local nem chamar POST/PUT no Rastreame
  --pull-only    Só importa do Rastreame → clientes.json
  --push-only    Só exporta clientes.json → Rastreame
  --force-pull   Sobrescreve local mesmo se editado após última sync
  --force-push   Empurra todos os clientes elegíveis ao Rastreame (mesmo já sincronizados)

Por defeito: push (local → Rastreame) e depois pull (Rastreame → local).
clientes.json é fonte da verdade; cliente ausente no Rastreame é inativado localmente.

Requer RASTREAME_AUTH ou RASTREAME_LOGIN+RASTREAME_SENHA nas variáveis de ambiente do utilizador.
`);
    process.exit(0);
  }

  const dryRun = argv.includes("--dry-run");
  const pullOnly = argv.includes("--pull-only");
  const pushOnly = argv.includes("--push-only");
  const forcePull = argv.includes("--force-pull");
  const forcePush = argv.includes("--force-push");

  const r = await syncMotoristas({
    dryRun,
    pull: !pushOnly,
    push: !pullOnly,
    forcePull,
    forcePush,
  });

  console.log("\n=== Push (local → Rastreame) ===");
  console.log(
    `criados: ${r.push.criados} | atualizados: ${r.push.atualizados} | inativados: ${r.push.inativados} | ignorados: ${r.push.ignorados}`,
  );
  if (r.push.erros.length) {
    console.log("Erros push:");
    for (const e of r.push.erros) console.log(`  - ${e}`);
  }

  console.log("\n=== Pull (Rastreame → local) ===");
  console.log(
    `novos: ${r.pull.novos} | atualizados: ${r.pull.atualizados} | inativados: ${r.pull.inativados} | ignorados: ${r.pull.ignorados}`,
  );
  if (r.pull.erros.length) {
    console.log("Erros pull:");
    for (const e of r.pull.erros) console.log(`  - ${e}`);
  }

  if (r.push.erros.length || r.pull.erros.length) process.exit(1);
}
