import {
  listarEscoposContratosAtivosCobranca,
  loadClientesDb,
  resolverCliente,
  type FiltroAlvosCobranca,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export type FiltroRelatorioInput = {
  placa?: string;
  clienteId?: string;
  clienteQuery?: string;
};

export function resolverFiltroRelatorio(input: FiltroRelatorioInput = {}): FiltroAlvosCobranca {
  const placa = input.placa?.trim();
  const clienteId = input.clienteId?.trim();
  const clienteQuery = input.clienteQuery?.trim();

  if (placa && (clienteId || clienteQuery)) {
    throw new HttpError(400, "Use apenas placa OU cliente — não ambos");
  }

  if (clienteQuery) {
    const c = resolverCliente(clienteQuery);
    if (!c.id) {
      throw new HttpError(400, `Cliente sem id em clientes.json: ${c.nome}`);
    }
    return { clienteId: c.id };
  }

  if (clienteId) return { clienteId };
  if (placa) return { placa };
  return {};
}

export function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

export function listarEscoposContratosAtivos(): Array<{
  clienteId: string;
  clienteNome: string;
  placas: string[];
}> {
  const contratos = listarEscoposContratosAtivosCobranca();
  const porCliente = new Map<string, Set<string>>();

  for (const e of contratos) {
    if (!e.clienteId) continue;
    const set = porCliente.get(e.clienteId) ?? new Set<string>();
    if (e.placa) set.add(e.placa);
    porCliente.set(e.clienteId, set);
  }

  const clientes = loadClientesDb().clientes;
  return [...porCliente.entries()]
    .map(([clienteId, placasSet]) => {
      const c = clientes.find((x) => x.id === clienteId);
      return {
        clienteId,
        clienteNome: c?.nome ?? clienteId,
        placas: [...placasSet].sort(),
      };
    })
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
}
