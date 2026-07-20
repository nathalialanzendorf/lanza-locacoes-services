import { closePgPool, runSchemaMigration } from "@lanza/db";

async function main(): Promise<void> {
  console.log("A aplicar migrações SQL (001–015)...");
  await runSchemaMigration();
  console.log("Schema migration concluída.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
