/**
 * Compara contagens ativo/inativo entre database/*.json (ficheiro) e lanza.json_stores (Postgres).
 *
 * Uso: npx tsx src/run.ts auditar-ativo-stores
 */
import path from "node:path";

import { getDbBackend, loadJsonDocument, loadJsonStore } from "@lanza/db";

import { isClienteAtivo, loadClientesDb, type ClienteRegistro } from "../lib/clientesDb.js";
import { loadContratosDb, type ContratoRegistro } from "../lib/contratosDb.js";
import { isVeiculoAtivo, loadVeiculosDb, type VeiculoRegistro } from "../lib/veiculosDb.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

type Contagens = {
  total: number;
  ativos: number;
  inativos: number;
};

function contarClientes(list: ClienteRegistro[]): Contagens {
  const ativos = list.filter(isClienteAtivo).length;
  return { total: list.length, ativos, inativos: list.length - ativos };
}

function contarVeiculos(list: VeiculoRegistro[]): Contagens {
  const ativos = list.filter(isVeiculoAtivo).length;
  return { total: list.length, ativos, inativos: list.length - ativos };
}

function contarContratos(list: ContratoRegistro[]): Contagens {
  const ativos = list.filter((c) => c.status === "ativo").length;
  return { total: list.length, ativos, inativos: list.length - ativos };
}

function contarParceirosComVeiculoAtivo(
  vinculos: { veiculoId: string; parceiroId: string }[],
  veiculos: VeiculoRegistro[],
  totalParceiros: number,
): Contagens {
  const ativosIds = new Set(veiculos.filter(isVeiculoAtivo).map((v) => v.id));
  const parceiroIds = new Set<string>();
  for (const v of vinculos) {
    if (ativosIds.has(v.veiculoId)) parceiroIds.add(v.parceiroId);
  }
  return { total: totalParceiros, ativos: parceiroIds.size, inativos: totalParceiros - parceiroIds.size };
}

function fmtDiff(a: Contagens, b: Contagens): string {
  const parts: string[] = [];
  if (a.total !== b.total) parts.push(`total ${a.total}→${b.total}`);
  if (a.ativos !== b.ativos) parts.push(`ativos ${a.ativos}→${b.ativos}`);
  if (a.inativos !== b.inativos) parts.push(`inativos ${a.inativos}→${b.inativos}`);
  return parts.length ? parts.join(", ") : "OK";
}

async function loadPgStore<T>(storeName: string): Promise<T | null> {
  if (getDbBackend() === "file") return null;
  return loadJsonStore<T>(storeName);
}

export async function auditarAtivoStores(): Promise<number> {
  const backend = getDbBackend();
  console.log(`Backend: ${backend}`);
  console.log(`Ficheiro: ${path.join(REPO_ROOT, "database")}\n`);

  const parceirosPath = path.join(REPO_ROOT, "database", "parceiros.json");
  const vinculosPath = path.join(REPO_ROOT, "database", "parceiro-veiculo.json");
  const parceirosFile = loadJsonDocument<{ parceiros?: { id: string }[] }>(parceirosPath);
  const vinculosFile = loadJsonDocument<{ vinculos?: { veiculoId: string; parceiroId: string }[] }>(
    vinculosPath,
  );

  const fileClientes = contarClientes(loadClientesDb().clientes);
  const fileVeiculos = contarVeiculos(loadVeiculosDb().veiculos);
  const fileContratos = contarContratos(loadContratosDb().contratos);
  const fileParceiros = contarParceirosComVeiculoAtivo(
    vinculosFile.vinculos ?? [],
    loadVeiculosDb().veiculos,
    parceirosFile.parceiros?.length ?? 0,
  );

  console.log("Ficheiro local (database/):");
  console.log(`  Clientes:  total=${fileClientes.total} ativos=${fileClientes.ativos} inativos=${fileClientes.inativos}`);
  console.log(`  Veículos:  total=${fileVeiculos.total} ativos=${fileVeiculos.ativos} inativos=${fileVeiculos.inativos}`);
  console.log(`  Contratos: total=${fileContratos.total} ativos=${fileContratos.ativos} encerrados=${fileContratos.inativos}`);
  console.log(
    `  Parceiros: total=${fileParceiros.total} com veículo ativo=${fileParceiros.ativos} sem veículo ativo=${fileParceiros.inativos}`,
  );

  if (backend === "file") {
    console.log("\nPostgres não configurado (LANZA_DB_BACKEND=file). Só ficheiro local.");
    return 0;
  }

  const pgClientes = await loadPgStore<{ clientes?: ClienteRegistro[] }>("clientes");
  const pgVeiculos = await loadPgStore<{ veiculos?: VeiculoRegistro[] }>("veiculos");
  const pgContratos = await loadPgStore<{ contratos?: ContratoRegistro[] }>("contratos");
  const pgVinculos = await loadPgStore<{ vinculos?: { veiculoId: string; parceiroId: string }[] }>(
    "parceiro-veiculo",
  );
  const pgParceiros = await loadPgStore<{ parceiros?: { id: string }[] }>("parceiros");

  if (!pgClientes && !pgVeiculos && !pgContratos) {
    console.error("\nNenhum store encontrado no Postgres — importar com scripts de migração.");
    return 1;
  }

  const pgClientesC = contarClientes(pgClientes?.clientes ?? []);
  const pgVeiculosC = contarVeiculos(pgVeiculos?.veiculos ?? []);
  const pgContratosC = contarContratos(pgContratos?.contratos ?? []);
  const pgParceirosC = contarParceirosComVeiculoAtivo(
    pgVinculos?.vinculos ?? [],
    pgVeiculos?.veiculos ?? [],
    pgParceiros?.parceiros?.length ?? 0,
  );

  console.log("\nPostgres (lanza.json_stores):");
  console.log(`  Clientes:  total=${pgClientesC.total} ativos=${pgClientesC.ativos} inativos=${pgClientesC.inativos}`);
  console.log(`  Veículos:  total=${pgVeiculosC.total} ativos=${pgVeiculosC.ativos} inativos=${pgVeiculosC.inativos}`);
  console.log(`  Contratos: total=${pgContratosC.total} ativos=${pgContratosC.ativos} encerrados=${pgContratosC.inativos}`);
  console.log(
    `  Parceiros: total=${pgParceirosC.total} com veículo ativo=${pgParceirosC.ativos} sem veículo ativo=${pgParceirosC.inativos}`,
  );

  console.log("\nDiferenças (ficheiro → Postgres):");
  console.log(`  Clientes:  ${fmtDiff(fileClientes, pgClientesC)}`);
  console.log(`  Veículos:  ${fmtDiff(fileVeiculos, pgVeiculosC)}`);
  console.log(`  Contratos: ${fmtDiff(fileContratos, pgContratosC)}`);
  console.log(`  Parceiros: ${fmtDiff(fileParceiros, pgParceirosC)}`);

  const diverge =
    fmtDiff(fileClientes, pgClientesC) !== "OK" ||
    fmtDiff(fileVeiculos, pgVeiculosC) !== "OK" ||
    fmtDiff(fileContratos, pgContratosC) !== "OK" ||
    fmtDiff(fileParceiros, pgParceirosC) !== "OK";

  if (diverge) {
    console.log(
      "\nAção sugerida: alinhar Postgres com database/ (import/mirror) ou redeploy após sync local.",
    );
    return 1;
  }

  console.log("\nFicheiro e Postgres alinhados nas contagens.");
  return 0;
}
