import path from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do repositório Aworklanza (2 níveis acima de `src/lib`). Na Vercel usa `cwd` (bundle). */
export const REPO_ROOT = process.env.VERCEL
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
