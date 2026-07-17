import { HttpError } from "../http.js";
import {
  gravarRastreameEspelhoConfig,
  obterRastreameEspelhoConfig,
} from "../lib-imports.js";

export function obterConfigRastreameEspelho() {
  return obterRastreameEspelhoConfig();
}

export function atualizarConfigRastreameEspelho(ativo: boolean) {
  try {
    return gravarRastreameEspelhoConfig(ativo);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}
