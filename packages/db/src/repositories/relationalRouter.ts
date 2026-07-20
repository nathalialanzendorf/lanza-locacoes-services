import {
  loadClientesFromSql,
  loadParceirosFromSql,
  loadVeiculosFromSql,
  loadVinculosFromSql,
  saveClientesToSql,
  saveParceirosToSql,
  saveVeiculosToSql,
  saveVinculosToSql,
} from "./coreRepositories.js";
import {
  loadClienteAnaliseFromSql,
  loadClienteDespesasFromSql,
  loadContratosFromSql,
  loadInfracoesFromSql,
  loadLocacoesFromSql,
  loadParceiroDespesasFromSql,
  loadTriagensFromSql,
  saveClienteAnaliseToSql,
  saveClienteDespesasToSql,
  saveContratosToSql,
  saveInfracoesToSql,
  saveLocacoesToSql,
  saveParceiroDespesasToSql,
  saveTriagensToSql,
  type ClienteAnaliseDbShape,
  type ClienteDespesasDbShape,
  type TriagemDbShape,
} from "./domainRepositories.js";
import { pgQuery } from "../client/PostgresPool.js";
import { exportJsonBackup } from "./jsonExport.js";

type Loader = () => Promise<Record<string, unknown>>;

const COUNT_QUERIES: Record<string, string> = {
  clientes: "SELECT COUNT(*)::int AS c FROM lanza.clientes",
  veiculos: "SELECT COUNT(*)::int AS c FROM lanza.veiculos",
  parceiros: "SELECT COUNT(*)::int AS c FROM lanza.parceiros",
  "parceiro-veiculo": "SELECT COUNT(*)::int AS c FROM lanza.parceiro_veiculo_vinculos",
  contratos: "SELECT COUNT(*)::int AS c FROM lanza.contratos",
  locacoes: "SELECT COUNT(*)::int AS c FROM lanza.locacoes",
  infracoes: "SELECT COUNT(*)::int AS c FROM lanza.infracoes",
  "cliente-despesas": "SELECT COUNT(*)::int AS c FROM lanza.cliente_despesas",
  "parceiro-despesas": "SELECT COUNT(*)::int AS c FROM lanza.parceiro_despesas",
  "analise-cadastro": "SELECT COUNT(*)::int AS c FROM lanza.cliente_analise_cadastro",
  "cliente-analise": "SELECT COUNT(*)::int AS c FROM lanza.cliente_analise_cadastro WHERE origem <> 'triagem'",
};
type Saver = (data: Record<string, unknown>) => Promise<void>;

const LOADERS: Record<string, Loader> = {
  clientes: async () => (await loadClientesFromSql()) as Record<string, unknown>,
  veiculos: async () => (await loadVeiculosFromSql()) as Record<string, unknown>,
  parceiros: async () => (await loadParceirosFromSql()) as Record<string, unknown>,
  "parceiro-veiculo": async () => (await loadVinculosFromSql()) as Record<string, unknown>,
  contratos: async () => (await loadContratosFromSql()) as Record<string, unknown>,
  locacoes: async () => (await loadLocacoesFromSql()) as Record<string, unknown>,
  infracoes: async () => (await loadInfracoesFromSql()) as Record<string, unknown>,
  "cliente-despesas": async () => (await loadClienteDespesasFromSql()) as Record<string, unknown>,
  "parceiro-despesas": async () => (await loadParceiroDespesasFromSql()) as Record<string, unknown>,
  "analise-cadastro": async () => (await loadTriagensFromSql()) as Record<string, unknown>,
  "cliente-analise": async () => (await loadClienteAnaliseFromSql()) as Record<string, unknown>,
};

const BACKUP_FILE: Record<string, string> = {
  clientes: "clientes.json",
  veiculos: "veiculos.json",
  parceiros: "parceiros.json",
  "parceiro-veiculo": "parceiro-veiculo.json",
  contratos: "contratos.json",
  locacoes: "locacoes.json",
  infracoes: "infracoes.json",
  "cliente-despesas": "cliente-despesas.json",
  "parceiro-despesas": "parceiro-despesas.json",
  "analise-cadastro": "analise-cadastro.json",
  "cliente-analise": "cliente-analise.json",
};

const SAVERS: Record<string, Saver> = {
  clientes: async (d) => saveClientesToSql(d as Parameters<typeof saveClientesToSql>[0]),
  veiculos: async (d) => saveVeiculosToSql(d as Parameters<typeof saveVeiculosToSql>[0]),
  parceiros: async (d) => saveParceirosToSql(d as Parameters<typeof saveParceirosToSql>[0]),
  "parceiro-veiculo": async (d) => saveVinculosToSql(d as Parameters<typeof saveVinculosToSql>[0]),
  contratos: async (d) => saveContratosToSql(d as Parameters<typeof saveContratosToSql>[0]),
  locacoes: async (d) => saveLocacoesToSql(d as Parameters<typeof saveLocacoesToSql>[0]),
  infracoes: async (d) => saveInfracoesToSql(d as Parameters<typeof saveInfracoesToSql>[0]),
  "cliente-despesas": async (d) =>
    saveClienteDespesasToSql(d as ClienteDespesasDbShape),
  "parceiro-despesas": async (d) =>
    saveParceiroDespesasToSql(d as Parameters<typeof saveParceiroDespesasToSql>[0]),
  "analise-cadastro": async (d) => saveTriagensToSql(d as TriagemDbShape),
  "cliente-analise": async (d) => saveClienteAnaliseToSql(d as ClienteAnaliseDbShape),
};

export function hasRelationalStore(storeName: string): boolean {
  return storeName in LOADERS;
}

export async function relationalStoreExists(storeName: string): Promise<boolean> {
  const q = COUNT_QUERIES[storeName];
  if (!q) return false;
  const r = await pgQuery<{ c: number }>(q);
  return Number(r.rows[0]?.c ?? 0) > 0;
}

export async function loadRelationalStore<T>(
  storeName: string,
): Promise<T | null> {
  const load = LOADERS[storeName];
  if (!load) return null;
  return (await load()) as T;
}

export async function saveRelationalStore(
  storeName: string,
  data: Record<string, unknown>,
): Promise<void> {
  const save = SAVERS[storeName];
  if (!save) {
    throw new Error(`Store relacional não mapeado: ${storeName}`);
  }
  await save(data);
  const backup = BACKUP_FILE[storeName];
  if (backup) exportJsonBackup(backup, data);
}
