import {
  importarContratos,
  type ImportarContratosOpts,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export type ImportarContratosInput = ImportarContratosOpts;

export async function executarImportacaoContratos(input: ImportarContratosInput = {}) {
  try {
    return await importarContratos(input);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}
