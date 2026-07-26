/** Categorias de despesa do cliente (valor gravado em `categoria`). */
export const CategoriaDespesaCliente = {
  Manutencao: "Manutenção",
  LocacaoSemanal: "Locação semanal",
  Diaria: "Diária",
  Caucao: "Caução",
  Outros: "Outros",
  Pedagio: "Pedágio",
  Infracao: "Infração",
  Estacionamento: "Estacionamento",
  QuebraContrato: "Quebra contrato",
  Renegociacao: "Renegociação",
  Lavacao: "Lavação",
} as const;

export type CategoriaDespesaClienteValor =
  (typeof CategoriaDespesaCliente)[keyof typeof CategoriaDespesaCliente];

/** Categorias replicadas em Gastos Gerais (Rastreame, tipo OUTROS). */
export const CATEGORIAS_SYNC_RASTREAME = new Set<CategoriaDespesaClienteValor>([
  CategoriaDespesaCliente.LocacaoSemanal,
  CategoriaDespesaCliente.Outros,
  CategoriaDespesaCliente.Caucao,
  CategoriaDespesaCliente.Estacionamento,
  CategoriaDespesaCliente.Pedagio,
  CategoriaDespesaCliente.Manutencao,
  CategoriaDespesaCliente.QuebraContrato,
]);

/** Alias legado — normalizar para {@link CategoriaDespesaCliente.Pedagio}. */
export const CATEGORIA_PEDAGIO_ALIAS = "Pedágio Digital";

/** Alias legado — normalizar para {@link CategoriaDespesaCliente.Estacionamento}. */
export const CATEGORIAS_ESTACIONAMENTO_ALIAS = [
  "Estacionamento rotativo SigaPay",
  "SigaPay",
] as const;
