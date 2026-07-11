import { listarClienteAnalise } from "../lib-imports.js";

export function listarAchadosClienteAnalise(opts: {
  cpf?: string;
  clienteId?: string;
  comAlerta?: boolean;
}) {
  const items = listarClienteAnalise({
    cpf: opts.cpf,
    clienteId: opts.clienteId,
    comAlerta: opts.comAlerta,
  });
  return { total: items.length, items };
}
