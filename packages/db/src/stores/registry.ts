/** Ficheiros `database/*.json` importáveis para `lanza.json_stores`. */
export const JSON_STORE_FILES = [
  "clientes.json",
  "veiculos.json",
  "contratos.json",
  "locacoes.json",
  "cliente-despesas.json",
  "parceiro-despesas.json",
  "parceiros.json",
  "parceiro-veiculo.json",
  "infracoes.json",
  "analise-cadastro.json",
  "cliente-analise.json",
] as const;

export type JsonStoreName = (typeof JSON_STORE_FILES)[number] extends `${infer N}.json` ? N : never;

export function jsonFileToStoreName(file: string): string {
  return file.replace(/\.json$/, "");
}
