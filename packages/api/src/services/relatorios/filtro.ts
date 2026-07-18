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
  dataInicial?: string;
  dataFinal?: string;
  situacao?: "em_aberto" | "pago" | "todos";
};

function normalizarSituacao(raw?: string): "em_aberto" | "pago" | "todos" | undefined {
  const s = raw?.trim().toLowerCase();
  if (!s) return undefined;
  if (s === "em_aberto" || s === "em aberto" || s === "aberto") return "em_aberto";
  if (s === "pago" || s === "paga" || s === "pagos") return "pago";
  if (s === "todos" || s === "todas") return "todos";
  return undefined;
}

export function resolverFiltroRelatorio(input: FiltroRelatorioInput = {}): FiltroAlvosCobranca {
  const placa = input.placa?.trim();
  const clienteId = input.clienteId?.trim();
  const clienteQuery = input.clienteQuery?.trim();
  const dataInicial = input.dataInicial?.trim();
  const dataFinal = input.dataFinal?.trim();
  const situacao = normalizarSituacao(input.situacao);

  if (input.situacao?.trim() && !situacao) {
    throw new HttpError(400, 'Situação inválida — use em_aberto, pago ou todos');
  }

  if (placa && (clienteId || clienteQuery)) {
    throw new HttpError(400, "Use apenas placa OU cliente — não ambos");
  }

  const extras = {
    ...(dataInicial ? { dataInicial } : {}),
    ...(dataFinal ? { dataFinal } : {}),
    ...(situacao ? { situacao } : {}),
  };

  if (clienteQuery) {
    const c = resolverCliente(clienteQuery);
    if (!c.id) {
      throw new HttpError(400, `Cliente sem id em clientes.json: ${c.nome}`);
    }
    return { clienteId: c.id, ...extras };
  }

  if (clienteId) return { clienteId, ...extras };
  if (placa) return { placa, ...extras };
  return extras;
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
