import { runSchemaMigration } from "./SchemaMigrator.js";
import { importJsonStores } from "./JsonImporter.js";

export type MigrateOptions = {
  importJson?: boolean;
  dryRun?: boolean;
};

export async function migratePostgres(opts: MigrateOptions = {}): Promise<void> {
  await runSchemaMigration(opts.dryRun);
  if (opts.importJson) {
    const { imported, skipped } = await importJsonStores(opts.dryRun);
    console.log(`Importados: ${imported.join(", ") || "(nenhum)"}`);
    if (skipped.length) console.log(`Ausentes (ignorados): ${skipped.join(", ")}`);
  }
}
