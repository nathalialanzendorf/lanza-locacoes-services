import path from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do repositório Aworklanza (2 níveis acima de `src/lib`). */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
