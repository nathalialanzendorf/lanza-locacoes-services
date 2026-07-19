import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = process.env.VERCEL
  ? process.cwd()
  : path.resolve(PACKAGE_ROOT, "..", "..");

/** Raiz do monorepo Aworklanza. */
export { REPO_ROOT };

/** Diretório dos ficheiros JSON locais (`database/*.json`). */
export const DATABASE_DIR = process.env.LANZA_DATABASE_DIR?.trim()
  ? path.resolve(process.env.LANZA_DATABASE_DIR.trim())
  : path.join(REPO_ROOT, "database");

/** Diretório das migrações SQL do pacote. */
export const SQL_DIR = path.join(PACKAGE_ROOT, "sql");

export const INITIAL_SCHEMA_SQL = path.join(SQL_DIR, "001_initial_schema.sql");
