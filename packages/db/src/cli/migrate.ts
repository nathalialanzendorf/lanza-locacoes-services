import { closePgPool } from "../client/PostgresPool.js";
import { migratePostgres } from "../migration/migrate.js";

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function main(): Promise<void> {
  const importJson = hasFlag(process.argv, "--import-json");
  const dryRun = hasFlag(process.argv, "--dry-run");

  await migratePostgres({ importJson, dryRun });
  if (!dryRun) console.log("Migração concluída.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => closePgPool());
