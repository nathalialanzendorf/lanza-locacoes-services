import {
  listarEscoposContratosAtivosCobranca,
  loadClientesDb,
  loadClientesDbAsync,
  loadCobrancasDbContextAsync,
  normNomeKey,
  type ClienteRegistro,
  type CobrancasDbContext,
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
  incluirEncerradosComPendencia?: boolean;
};

function normalizarSituacao(raw?: string): "em_aberto" | "pago" | "todos" | undefined {
  const s = raw?.trim().toLowerCase();
  if (!s) return undefined;
  if (s === "em_aberto" || s === "em aberto" || s === "aberto") return "em_aberto";
  if (s === "pago" || s === "paga" || s === "pagos") return "pago";
  if (s === "todos" || s === "todas") return "todos";
  return undefined;
}

export function resolverClienteFromList(query: string, clientes: ClienteRegistro[]): ClienteRegistro {
  const q = query.trim();
  if (!q) throw new Error("Informe --cliente (nome, CPF ou id).");

  const key = q.replace(/\D/g, "");
  if (key.length === 11) {
    const byCpf = clientes.find((c) => c.cpf?.replace(/\D/g, "") === key);
    if (byCpf) return byCpf;
  }

  const byId = clientes.find((c) => c.id === q);
  if (byId) return byId;

  const nk = normNomeKey(q);
  const matches = clientes.filter((c) => {
    const cn = normNomeKey(c.nome);
    return cn.includes(nk) || nk.includes(cn);
  });
  if (matches.length === 0) {
    throw new Error(`Cliente "${query}" não encontrado em clientes.json.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Vários clientes para "${query}": ${matches.map((m) => `${m.nome} (${m.cpf})`).join("; ")} — use CPF ou id.`,
    );
  }
  return matches[0]!;
}

export function resolverFiltroRelatorio(input: FiltroRelatorioInput = {}): FiltroAlvosCobranca {
  return resolverFiltroRelatorioComClientes(input, loadClientesDb().clientes);
}

export function resolverFiltroRelatorioComClientes(
  input: FiltroRelatorioInput,
  clientes: ClienteRegistro[],
): FiltroAlvosCobranca {
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
    ...(input.incluirEncerradosComPendencia === false
      ? { incluirEncerradosComPendencia: false as const }
      : input.incluirEncerradosComPendencia === true
        ? { incluirEncerradosComPendencia: true as const }
        : {}),
  };

  if (clienteQuery) {
    const c = resolverClienteFromList(clienteQuery, clientes);
    if (!c.id) {
      throw new HttpError(400, `Cliente sem id em clientes.json: ${c.nome}`);
    }
    return { clienteId: c.id, ...extras };
  }

  if (clienteId) return { clienteId, ...extras };
  if (placa) return { placa, ...extras };
  return extras;
}

export async function resolverFiltroRelatorioAsync(
  input: FiltroRelatorioInput = {},
  ctx?: CobrancasDbContext,
): Promise<FiltroAlvosCobranca> {
  const clientes = ctx?.clientes ?? (await loadClientesDbAsync()).clientes;
  return resolverFiltroRelatorioComClientes(input, clientes);
}

export function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

function mapEscoposContratos(
  contratos: ReturnType<typeof listarEscoposContratosAtivosCobranca>,
  clientes: ClienteRegistro[],
) {
  const porCliente = new Map<string, Set<string>>();

  for (const e of contratos) {
    if (!e.clienteId) continue;
    const set = porCliente.get(e.clienteId) ?? new Set<string>();
    if (e.placa) set.add(e.placa);
    porCliente.set(e.clienteId, set);
  }

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

export async function listarEscoposContratosAtivosAsync() {
  const ctx = await loadCobrancasDbContextAsync();
  const contratos = listarEscoposContratosAtivosCobranca(ctx);
  return mapEscoposContratos(contratos, ctx.clientes);
}

export function listarEscoposContratosAtivos() {
  const contratos = listarEscoposContratosAtivosCobranca();
  return mapEscoposContratos(contratos, loadClientesDb().clientes);
}
