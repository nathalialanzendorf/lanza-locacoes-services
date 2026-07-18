import { closePgPool } from "../lib/postgres/index.js";
import { syncPostgresql } from "../lib/postgres/syncPostgresql.js";

const HELP = `sync-postgresql — espelha database/*.json no PostgreSQL (RDS)

Uso:
  sync-postgresql                         Todos os stores importáveis
  sync-postgresql cliente-despesas.json   Um ficheiro (ou vários)
  sync-postgresql --dry-run

Gravações com LANZA_DB_BACKEND=dual (padrão com PGHOST+PGPASSWORD) já espelham
automaticamente via saveJsonDocument / save*Db. Use este comando após:
  - alteração directa ao JSON;
  - script que correu com LANZA_DB_BACKEND=file;
  - falha de espelho reportada no log [lanza/db].

Requer: PGHOST + PGPASSWORD (local) ou credenciais IAM/OIDC na Vercel.
Alias: npm run lanza -- postgres sync-all
`;

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function storeArgs(args: string[]): string[] {
  return args.filter((a) => !a.startsWith("-"));
}

export async function main(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    console.log(HELP);
    return;
  }

  const dryRun = hasFlag(args, "--dry-run");
  const files = storeArgs(args);

  try {
    const { imported, skipped } = await syncPostgresql({
      dryRun,
      files: files.length ? files : undefined,
    });
    if (dryRun) {
      console.log(`[dry-run] Importaria: ${imported.join(", ")}`);
    } else {
      console.log(`OK — espelhados no PostgreSQL: ${imported.join(", ")}`);
    }
    if (skipped.length) {
      console.log(`Ignorados (ficheiro ausente): ${skipped.join(", ")}`);
    }
    if (files.length && skipped.length === files.length) {
      process.exit(1);
    }
  } finally {
    await closePgPool();
  }
}
