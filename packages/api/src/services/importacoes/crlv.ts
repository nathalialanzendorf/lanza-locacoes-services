import {
  sincronizarVeiculosCrlv,
  type SincronizarVeiculosCrlvOpts,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export type ImportarCrlvInput = SincronizarVeiculosCrlvOpts;

export async function executarImportacaoCrlv(input: ImportarCrlvInput = {}) {
  try {
    return await sincronizarVeiculosCrlv(input);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}
