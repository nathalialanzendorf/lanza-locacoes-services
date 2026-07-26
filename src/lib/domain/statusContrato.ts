/** Status gravado em `contratos.status`. */
export const StatusContrato = {
  Ativo: "ativo",
  Encerrado: "encerrado",
} as const;

export type StatusContratoValor = (typeof StatusContrato)[keyof typeof StatusContrato];

/** Como o veículo saiu da locação (contrato encerrado). */
export const MotivoEncerramento = {
  Devolvido: "devolvido",
  Recuperado: "recuperado",
  Troca: "troca",
} as const;

export type MotivoEncerramentoValor = (typeof MotivoEncerramento)[keyof typeof MotivoEncerramento];

export function parseStatusContrato(raw: string | null | undefined): StatusContratoValor {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === StatusContrato.Encerrado) return StatusContrato.Encerrado;
  return StatusContrato.Ativo;
}

/** Contrato em locação ativa (status ativo e sem data de encerramento). */
export function contratoOperacionalAtivo(c: {
  status?: string | null;
  dataEncerramento?: string | null;
}): boolean {
  if (parseStatusContrato(c.status) !== StatusContrato.Ativo) return false;
  return !String(c.dataEncerramento ?? "").trim();
}
