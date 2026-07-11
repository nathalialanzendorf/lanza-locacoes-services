import { importarClientesRastreame } from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export async function executarImportacaoClientesRastreame(opts: { dryRun?: boolean } = {}) {
  try {
    return await importarClientesRastreame(opts);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
}
