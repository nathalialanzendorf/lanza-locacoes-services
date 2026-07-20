import {
  getDbBackend,
  importJsonStores,
  importJsonToRelational,
  runSchemaMigration,
  type ImportResult,
  type RelationalImportResult,
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

/** Espelha `database/*.json` no PostgreSQL (tabelas relacional ou legado json_stores). */
export async function syncPostgresql(
  options: SyncPostgresqlOptions = {},
): Promise<ImportResult | RelationalImportResult> {
  if (!postgresConfigured()) {
    throw new Error(
      "PostgreSQL não configurado. Execute .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
    );
  }
  const dryRun = options.dryRun ?? false;
  await runSchemaMigration(dryRun);

  const useRelational = process.env.LANZA_DB_RELATIONAL !== "0";
  if (useRelational) {
    const stores = options.files?.length
      ? options.files.map((f) => f.replace(".json", "").replace("parceiro-veiculo", "parceiro_veiculo").replace("cliente-despesas", "cliente_despesas").replace("parceiro-despesas", "parceiro_despesas").replace("analise-cadastro", "triagens").replace("cliente-analise", "cliente_analise"))
      : undefined;
    return importJsonToRelational({ dryRun, stores });
  }

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
