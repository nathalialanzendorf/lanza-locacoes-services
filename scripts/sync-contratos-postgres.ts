import { loadContratosDb, saveContratosDb, saveContratosDbAsync } from "../src/lib/contratosDb.js";

async function main() {
  const db = loadContratosDb();
  saveContratosDb(db);
  try {
    await saveContratosDbAsync(db);
    console.log("OK — contratos.json gravado (ficheiro + PostgreSQL).");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`PostgreSQL indisponível localmente: ${msg}`);
    console.log("Ficheiro database/contratos.json atualizado. Use:");
    console.log("  npx tsx src/run.ts postgres sync-store contratos.json");
    console.log("  ou POST /api/admin/migrar { \"stores\": [\"contratos.json\"] } na Vercel.");
    process.exitCode = 1;
  }
}

void main();
