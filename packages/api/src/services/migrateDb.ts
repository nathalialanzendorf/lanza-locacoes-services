import {
  createVercelPostgresPool,
  getDefaultPostgresPool,
  importJsonStores,
  JsonStoreRepository,
  runSchemaMigration,
  setVercelPostgresPool,
} from "@lanza/db";

import { HttpError } from "../http.js";

export type DbAdminStatus = {
  vercel: boolean;
  postgres: { ok: boolean; error?: string };
  stores: string[];
  bootstrapAllowed: boolean;
};

function assertVercelRuntime(): void {
  if (!process.env.VERCEL) {
    throw new HttpError(
      400,
      "Migração PostgreSQL remota só pode correr no runtime Vercel (OIDC → RDS).",
    );
  }
}

function ensureVercelPool(): void {
  if (!process.env.AWS_ROLE_ARN?.trim()) {
    throw new HttpError(500, "AWS_ROLE_ARN não configurado na Vercel.");
  }
  if (!process.env.PGHOST?.trim() && !process.env.DATABASE_URL?.trim()) {
    throw new HttpError(500, "PGHOST ou DATABASE_URL não configurado na Vercel.");
  }
  setVercelPostgresPool(createVercelPostgresPool());
}

export async function obterDbAdminStatus(): Promise<DbAdminStatus> {
  if (!process.env.VERCEL) {
    return {
      vercel: false,
      postgres: { ok: false, error: "Fora da Vercel" },
      stores: [],
      bootstrapAllowed: false,
    };
  }

  try {
    ensureVercelPool();
    const repo = new JsonStoreRepository(getDefaultPostgresPool());
    await getDefaultPostgresPool().query("SELECT 1");
    const stores = await repo.list();
    return {
      vercel: true,
      postgres: { ok: true },
      stores,
      bootstrapAllowed: stores.length === 0,
    };
  } catch (err) {
    return {
      vercel: true,
      postgres: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      stores: [],
      bootstrapAllowed: false,
    };
  }
}

export async function executarMigracaoDb(opts: {
  importJson?: boolean;
  dryRun?: boolean;
}): Promise<{
  dryRun: boolean;
  importJson: boolean;
  imported: string[];
  skipped: string[];
  stores: string[];
}> {
  assertVercelRuntime();
  ensureVercelPool();

  const importJson = opts.importJson !== false;
  const dryRun = opts.dryRun === true;

  if (dryRun) {
    await runSchemaMigration(true);
    const preview = importJson ? await importJsonStores(true) : { imported: [], skipped: [] };
    return {
      dryRun: true,
      importJson,
      imported: preview.imported,
      skipped: preview.skipped,
      stores: [],
    };
  }

  await runSchemaMigration(false);
  const { imported, skipped } = importJson
    ? await importJsonStores(false)
    : { imported: [] as string[], skipped: [] as string[] };
  const stores = await new JsonStoreRepository(getDefaultPostgresPool()).list();

  return {
    dryRun: false,
    importJson,
    imported,
    skipped,
    stores,
  };
}
