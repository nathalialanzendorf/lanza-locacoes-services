import type { ClienteRegistro } from "./clientesDb.js";

export function formatClienteLabel(c: {
  nome?: string | null;
  id?: string;
  ativo?: boolean;
}): string {
  const nome = c.nome?.trim() || c.id?.slice(0, 8) || "—";
  if (c.ativo === false) return nome.toLocaleUpperCase("pt-BR");
  return nome;
}

export function formatClienteNomeExibicao(
  nome: string | null | undefined,
  ativo?: boolean,
): string {
  const n = nome?.trim();
  if (!n) return "—";
  if (ativo === false) return n.toLocaleUpperCase("pt-BR");
  return n;
}

export function clienteExibicaoPorId(
  clientes: Pick<ClienteRegistro, "id" | "nome" | "ativo">[] | undefined,
  clienteId: string | null | undefined,
  fallbackNome?: string | null,
): string {
  const id = clienteId?.trim();
  if (id) {
    const c = clientes?.find((x) => x.id === id);
    if (c) return formatClienteLabel(c);
  }
  return formatClienteNomeExibicao(fallbackNome);
}
