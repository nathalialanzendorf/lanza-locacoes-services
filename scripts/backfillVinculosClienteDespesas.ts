/**
 * Normaliza vínculos de database/cliente-despesas.json (e PostgreSQL em dual/postgres):
 * - veiculoId → UUID do veículo (FK lanza.veiculos)
 * - condutorId → UUID do cliente responsável (FK lanza.clientes)
 *
 * Despesas de parceiro (debitoParceiroConfirmado) não recebem condutorId.
 *
 * Uso:
 *   npx tsx scripts/backfillVinculosClienteDespesas.ts --dry-run
 *   npx tsx scripts/backfillVinculosClienteDespesas.ts
 *   npx tsx scripts/backfillVinculosClienteDespesas.ts --cliente-id <uuid>
 */
import {
  inferirCondutorIdDespesaPorContratosDb,
  isClienteDespesaAtiva,
  loadClienteDespesasDbAsync,
  resolverCondutorVigencia,
  saveClienteDespesasDbAsync,
  type ClienteDespesaRegistro,
} from "../src/lib/clienteDespesasDb.js";
import { loadClientesDbAsync } from "../src/lib/clientesDb.js";
import { loadContratosDbAsync } from "../src/lib/contratosDb.js";
import { isEntityUuid } from "../src/lib/filtroListagem.js";
import { loadVeiculosDbAsync, type VeiculoRegistro } from "../src/lib/veiculosDb.js";
import { findVeiculoInDb } from "../src/lib/veiculosDb.js";

type Stats = {
  total: number;
  veiculoIdCorrigido: number;
  condutorIdCorrigido: number;
  semVeiculo: number;
  semCondutor: number;
  ignoradasParceiro: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clienteExiste(id: string | null | undefined, ids: Set<string>): id is string {
  return Boolean(id?.trim() && ids.has(id.trim()));
}

function resolverVeiculoUuid(
  d: ClienteDespesaRegistro,
  veiculos: VeiculoRegistro[],
): VeiculoRegistro | null {
  const ref = String(d.veiculoId ?? "").trim();
  if (!ref) return null;
  if (isEntityUuid(ref)) {
    return findVeiculoInDb({ veiculos }, ref);
  }
  return findVeiculoInDb({ veiculos }, ref);
}

function inferirCondutorId(
  d: ClienteDespesaRegistro,
  veiculo: VeiculoRegistro | null,
  clienteIds: Set<string>,
  contratos: Awaited<ReturnType<typeof loadContratosDbAsync>>["contratos"],
  veiculos: VeiculoRegistro[],
): string | null {
  if (clienteExiste(d.condutorId, clienteIds)) return d.condutorId!.trim();
  if (d.debitoParceiroConfirmado === true && d.debitoParceiroId) return null;

  const dParaInferencia: ClienteDespesaRegistro = {
    ...d,
    condutorId: clienteExiste(d.condutorId, clienteIds) ? d.condutorId : undefined,
    condutorNaoIdentificado: false,
    condutorConfirmado: false,
  };

  const porContrato = inferirCondutorIdDespesaPorContratosDb(
    dParaInferencia,
    contratos,
    veiculos,
  );
  if (clienteExiste(porContrato, clienteIds)) return porContrato!.trim();

  const placaRef = veiculo?.placa ?? String(d.veiculoId ?? "");
  if (String(d.dataAutuacao ?? "").trim()) {
    const res = resolverCondutorVigencia(placaRef, String(d.dataAutuacao ?? ""));
    if (clienteExiste(res.condutorId, clienteIds)) return res.condutorId!.trim();
  }

  if (veiculo?.clienteVinculadoId && clienteExiste(veiculo.clienteVinculadoId, clienteIds)) {
    return veiculo.clienteVinculadoId.trim();
  }

  return null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const clienteIdx = process.argv.indexOf("--cliente-id");
  const clienteFiltro = clienteIdx >= 0 ? process.argv[clienteIdx + 1]?.trim() : "";

  const [despesasDb, clientesDb, veiculosDb, contratosDb] = await Promise.all([
    loadClienteDespesasDbAsync(),
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadContratosDbAsync(),
  ]);

  const clienteIds = new Set(
    clientesDb.clientes.map((c) => c.id).filter((id): id is string => Boolean(id?.trim())),
  );

  const stats: Stats = {
    total: 0,
    veiculoIdCorrigido: 0,
    condutorIdCorrigido: 0,
    semVeiculo: 0,
    semCondutor: 0,
    ignoradasParceiro: 0,
  };

  const amostras: string[] = [];

  for (const d of despesasDb.clienteDespesas) {
    if (!isClienteDespesaAtiva(d)) continue;
    if (clienteFiltro && d.condutorId !== clienteFiltro) {
      const veiculoProbe = resolverVeiculoUuid(d, veiculosDb.veiculos);
      if (veiculoProbe?.clienteVinculadoId !== clienteFiltro) continue;
    }

    stats.total++;
    const veiculo = resolverVeiculoUuid(d, veiculosDb.veiculos);
    const veiculoUuid = veiculo?.id ?? null;

    if (!veiculoUuid) {
      stats.semVeiculo++;
      if (amostras.length < 8) {
        amostras.push(`sem veículo: ${d.autoInfracao} | ref=${d.veiculoId}`);
      }
      continue;
    }

    if (d.veiculoId !== veiculoUuid) {
      d.veiculoId = veiculoUuid;
      stats.veiculoIdCorrigido++;
    }

    if (d.debitoParceiroConfirmado === true && d.debitoParceiroId) {
      stats.ignoradasParceiro++;
      continue;
    }

    const condutorId = inferirCondutorId(
      d,
      veiculo,
      clienteIds,
      contratosDb.contratos,
      veiculosDb.veiculos,
    );

    if (condutorId && d.condutorId !== condutorId) {
      d.condutorId = condutorId;
      d.condutorConfirmado = d.condutorConfirmado === true || Boolean(condutorId);
      d.condutorNaoIdentificado = false;
      d.atualizadoEm = nowIso();
      stats.condutorIdCorrigido++;
      if (amostras.length < 8) {
        amostras.push(`condutor: ${d.autoInfracao} → ${condutorId.slice(0, 8)}…`);
      }
    } else if (!condutorId) {
      stats.semCondutor++;
    }
  }

  console.log(
    `Backfill vínculos cliente-despesas${dryRun ? " (DRY-RUN)" : ""}: ` +
      `${stats.total} ativas analisadas | veiculoId→uuid: ${stats.veiculoIdCorrigido} | ` +
      `condutorId preenchido: ${stats.condutorIdCorrigido} | sem veículo: ${stats.semVeiculo} | ` +
      `sem condutor: ${stats.semCondutor} | parceiro (ignoradas): ${stats.ignoradasParceiro}`,
  );

  for (const linha of amostras) console.log(`  • ${linha}`);

  if (dryRun) {
    console.log("\n(DRY-RUN — nada gravado. Rode sem --dry-run para aplicar.)");
    return;
  }

  await saveClienteDespesasDbAsync(despesasDb);
  console.log("\nGravado em database/cliente-despesas.json (+ PostgreSQL se LANZA_DB_BACKEND=postgres).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
