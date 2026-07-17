/**
 * Atualiza campos FIPE em database/veiculos.json (frota ativa ou --placa).
 *
 * Uso:
 *   npx tsx src/run.ts sync-fipe [--placa PLACA] [--faltantes] [--dry-run]
 */
import { preencherFipeFaltante } from "../lib/rastreame/rastreaveisSync.js";
import { main as atualizarFipeMain } from "./atualizarFipeVeiculos.js";

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`Uso:
  sync-fipe [opções]

Opções:
  --placa PLACA   Só este veículo (mesmo inativo)
  --faltantes     Só veículos ativos sem FIPE (não reconsulta quem já tem)
  --dry-run       Simula (--faltantes apenas)

Por defeito: atualiza FIPE de toda a frota ativa.

Sync separado do sync-rastreaveis (Rastreame). Rode após sync-rastreaveis se
importou veículos novos.

Equivalente legado: atualizar-fipe-veiculos
`);
    process.exit(0);
  }

  const dryRun = argv.includes("--dry-run");
  const placaIdx = argv.indexOf("--placa");
  const placa = placaIdx >= 0 ? argv[placaIdx + 1] : undefined;

  if (placa?.trim()) {
    await atualizarFipeMain(["--placa", placa.trim()]);
    return;
  }

  if (argv.includes("--faltantes")) {
    const r = await preencherFipeFaltante({ dryRun });
    console.log("\n=== FIPE (veículos ativos sem FIPE) ===");
    console.log(`atualizados: ${r.atualizados} | ignorados: ${r.ignorados}`);
    if (r.erros.length) {
      console.log("Erros FIPE:");
      for (const e of r.erros) console.log(`  - ${e}`);
      process.exit(1);
    }
    return;
  }

  await atualizarFipeMain([]);
}
