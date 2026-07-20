import {
  createVercelPostgresPool,
  getDefaultPostgresPool,
  importJsonToRelational,
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

async function countRelationalRows(): Promise<number> {
  const r = await getDefaultPostgresPool().query(
    "SELECT COUNT(*)::int AS c FROM lanza.clientes",
  );
  return Number(r.rows[0]?.c ?? 0);
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
    await getDefaultPostgresPool().query("SELECT 1");
    try {
      const n = await countRelationalRows();
      const stores =
        n > 0
          ? [
              "clientes",
              "veiculos",
              "parceiros",
              "contratos",
              "locacoes",
              "infracoes",
              "cliente-despesas",
              "parceiro-despesas",
            ]
          : [];
      return {
        vercel: true,
        postgres: { ok: true },
        stores,
        bootstrapAllowed: n === 0,
      };
    } catch (listErr) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      if (/does not exist/i.test(msg)) {
        return {
          vercel: true,
          postgres: { ok: true, error: "schema pendente (lanza.*)" },
          stores: [],
          bootstrapAllowed: true,
        };
      }
      throw listErr;
    }
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

/** Converte nome de store JSON (ex. analise-cadastro) para importador relacional. */
function mapStoreFilter(stores?: string[]): string[] | undefined {
  if (!stores?.length) return undefined;
  const map: Record<string, string> = {
    "analise-cadastro": "triagens",
    "cliente-analise": "cliente_analise",
    "parceiro-veiculo": "parceiro_veiculo",
    "cliente-despesas": "cliente_despesas",
    "parceiro-despesas": "parceiro_despesas",
  };
  return stores.map((s) => map[s] ?? s.replace(/-/g, "_"));
}

export async function executarMigracaoDb(opts: {
  importJson?: boolean;
  dryRun?: boolean;
  stores?: string[];
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
  const relationalStores = mapStoreFilter(opts.stores);

  if (dryRun) {
    await runSchemaMigration(true);
    const preview = importJson
      ? await importJsonToRelational({ dryRun: true, stores: relationalStores })
      : { imported: [] as string[], skipped: [] as string[] };
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
    ? await importJsonToRelational({ dryRun: false, stores: relationalStores })
    : { imported: [] as string[], skipped: [] as string[] };
  const n = await countRelationalRows();

  return {
    dryRun: false,
    importJson,
    imported,
    skipped,
    stores:
      n > 0
        ? [
            "clientes",
            "veiculos",
            "parceiros",
            "contratos",
            "locacoes",
            "infracoes",
            "cliente-despesas",
            "parceiro-despesas",
          ]
        : [],
  };
}

/** Define senha estática do PGUSER (executar na Vercel — já ligada via OIDC/IAM). */
export async function definirSenhaPostgresMaster(password: string): Promise<{ user: string }> {
  assertVercelRuntime();
  ensureVercelPool();
  const user = process.env.PGUSER?.trim() || "postgres";
  if (!password || password.trim().length < 8) {
    throw new HttpError(400, "Senha inválida (mínimo 8 caracteres).");
  }
  const role = user.replace(/"/g, '""');
  const passLiteral = `'${password.trim().replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  await getDefaultPostgresPool().query(`ALTER ROLE "${role}" WITH PASSWORD ${passLiteral}`);
  return { user };
}
