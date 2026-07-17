/** Normaliza campos legados `condutor*` para `cliente*` vindos da API. */

type ComClienteId = { clienteId?: string | null; condutorId?: string | null };
type ComClienteConfirmado = { clienteConfirmado?: boolean; condutorConfirmado?: boolean };
type ComClienteNaoId = { clienteNaoIdentificado?: boolean; condutorNaoIdentificado?: boolean };
type ComClienteNome = { clienteNome?: string | null; condutorNome?: string | null };

export function clienteIdDe<T extends ComClienteId>(item: T): string | null | undefined {
  return item.clienteId ?? item.condutorId;
}

export function clienteConfirmadoDe<T extends ComClienteConfirmado>(item: T): boolean | undefined {
  return item.clienteConfirmado ?? item.condutorConfirmado;
}

export function clienteNaoIdentificadoDe<T extends ComClienteNaoId>(item: T): boolean | undefined {
  return item.clienteNaoIdentificado ?? item.condutorNaoIdentificado;
}

export function clienteNomeDe<T extends ComClienteNome>(item: T): string | null | undefined {
  return item.clienteNome ?? item.condutorNome;
}

export function semClienteDeResumo(infracoes: {
  semCliente?: number;
  semCondutor?: number;
}): number {
  return infracoes.semCliente ?? infracoes.semCondutor ?? 0;
}
