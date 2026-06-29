/** Tipos compartilhados da triagem de locatário. */

export type StatusFonte = "pendente" | "ok" | "erro" | "assistido" | "pulado";

/** Sinal de risco encontrado numa fonte (ex.: um mandado, um processo). */
export interface AchadoTriagem {
  tipo: string;
  descricao: string;
  detalhes?: Record<string, unknown>;
}

/** Resultado normalizado de uma fonte consultada. */
export interface ResultadoFonte {
  id: string;
  nome: string;
  status: StatusFonte;
  /** true quando a fonte indica risco (mandado/processo/registro encontrado). */
  alerta: boolean;
  observacao: string;
  achados: AchadoTriagem[];
  /** Caminho de evidência salva (ex.: PDF do PF), relativo ao repo. */
  evidencia?: string | null;
  consultadoEm: string;
}

export interface DadosLocatario {
  cpf: string;
  cpfFormatado: string;
  nome: string;
  nascimento: string;
  /** Filiação (da CNH) — a PF usa nome da mãe para refinar/desambiguar. */
  maeNome?: string | null;
  paiNome?: string | null;
  /** Naturalidade (da CNH) — opcionais para a PF. */
  ufNascimento?: string | null;
  municipioNascimento?: string | null;
  /** Identidade (da CNH) — o TJSC pede RG + órgão expedidor na requisição. */
  rg?: string | null;
  orgaoExpedidor?: string | null;
  /**
   * Residência (do comprovante de endereço) — o TJSC EXIGE o município de
   * residência; UF e endereço completos são complementares. Sem município, a
   * requisição do TJSC fica assistida (o operador escolhe e envia).
   */
  ufResidencia?: string | null;
  municipioResidencia?: string | null;
  enderecoResidencia?: string | null;
}
