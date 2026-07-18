import {
  getDbBackend,
  importJsonStores,
  runSchemaMigration,
  type ImportResult,
} from "@lanza/db";

function postgresConfigured(): boolean {
  const hasHost = Boolean(
    process.env.PGHOST?.trim() || process.env.DATABASE_URL?.trim(),
  );
  const hasAuth = Boolean(
    process.env.PGPASSWORD?.trim() ||
      process.env.AWS_ROLE_ARN?.trim(),
  );
  return hasHost && hasAuth;
}

export type SyncPostgresqlOptions = {
  files?: readonly string[];
  dryRun?: boolean;
};

/** Espelha `database/*.json` no PostgreSQL (`lanza.json_stores`). */
export async function syncPostgresql(
  options: SyncPostgresqlOptions = {},
): Promise<ImportResult> {
  if (!postgresConfigured()) {
    throw new Error(
      "PostgreSQL não configurado. Execute .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
    );
  }
  const dryRun = options.dryRun ?? false;
  await runSchemaMigration(dryRun);
  if (options.files?.length) {
    return importJsonStores(dryRun, options.files);
  }
  return importJsonStores(dryRun);
}

/**
 * Após gravar só em ficheiro (`LANZA_DB_BACKEND=file`), espelha no Postgres.
 * Com `dual`/`postgres`, `saveJsonDocument*` já espelha — no-op.
 */
export async function mirrorStoreIfNeeded(storeFile: string): Promise<boolean> {
  const backend = getDbBackend();
  if (backend === "dual" || backend === "postgres") {
    return false;
  }
  if (!postgresConfigured()) {
    console.warn(
      `[lanza] PostgreSQL não configurado — ${storeFile} ficou só em database/.`,
    );
    console.warn("  Depois: npm run lanza -- sync-postgresql");
    return false;
  }
  const { imported, skipped } = await syncPostgresql({ files: [storeFile] });
  if (skipped.length) {
    throw new Error(`Ficheiro não encontrado: ${skipped.join(", ")}`);
  }
  console.log(`OK — espelhado no PostgreSQL: ${imported.join(", ")}`);
  return true;
}
