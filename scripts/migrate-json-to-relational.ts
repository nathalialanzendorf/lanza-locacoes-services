import { closePgPool } from "@lanza/db";
import { importJsonToRelational } from "../packages/db/src/migration/JsonToRelationalImporter.js";
import { runSchemaMigration } from "@lanza/db";

function parseArgs(argv: string[]): { dryRun: boolean; stores?: string[]; skipSchema: boolean } {
  let dryRun = false;
  let skipSchema = false;
  let stores: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-schema") skipSchema = true;
    else if (a === "--store" && argv[i + 1]) {
      stores = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { dryRun, stores, skipSchema };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.skipSchema) {
    console.log("A aplicar migrações SQL (001–015)...");
    await runSchemaMigration(opts.dryRun);
  }

  console.log(opts.dryRun ? "[dry-run] Importação relacional..." : "Importando JSON → tabelas relacional...");
  const result = await importJsonToRelational({
    dryRun: opts.dryRun,
    stores: opts.stores,
  });

  console.log("\nStores importados:", result.imported.join(", ") || "(nenhum)");
  if (result.skipped.length) console.log("Ignorados:", result.skipped.join(", "));
  console.log("\nContagens:");
  for (const [store, c] of Object.entries(result.counts)) {
    console.log(`  ${store}: ${c.json} registos`);
  }
  if (result.warnings.length) {
    console.log(`\nAvisos (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 20)) console.log(`  - ${w}`);
    if (result.warnings.length > 20) console.log(`  ... +${result.warnings.length - 20} avisos`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
