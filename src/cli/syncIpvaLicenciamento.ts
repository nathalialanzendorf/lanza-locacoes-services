import fs from "node:fs";
import path from "node:path";

import {
  processarDespesasDetranSc,
  sincronizarDespesasFrotaDetranSc,
  sincronizarDespesasPorTicketDetranSc,
  sincronizarDespesasVeiculoDetranSc,
  type SyncDespesasResult,
} from "../lib/detranSc/syncDespesasVeiculo.js";
import { loadVeiculosParaSync } from "../lib/detranSc/syncVeiculo.js";
import { RELATORIOS_SYNC_DIR, ensureRelatoriosDirs } from "../lib/relatoriosPaths.js";

function printResumo(r: SyncDespesasResult): void {
  console.log(
    `${r.placa} | novos: ${r.novos} | atualizados: ${r.atualizados} | sem alteração: ${r.semAlteracao} | débitos ignorados (não IPVA/lic.): ${r.ignorados}`,
  );
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
}

export async function main(argv: string[]): Promise<void> {
  let placa: string | undefined;
  let dryRun = false;
  let ticket: string | undefined;
  let jsonIn: string | undefined;
  let delayMs = 1500;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--placa" && argv[i + 1]) placa = argv[++i];
    else if (a === "--ticket" && argv[i + 1]) ticket = argv[++i];
    else if (a === "--json" && argv[i + 1]) jsonIn = argv[++i];
    else if (a === "--delay-ms" && argv[i + 1]) delayMs = Number(argv[++i]);
    else if (a === "-h" || a === "--help") {
      console.log(`sync-ipva-licenciamento [--placa PLACA] [--dry-run] [--delay-ms N]

Sincroniza débitos de IPVA e Licenciamento (DETRAN SC) → database/parceiro-despesas.json.

Opções alternativas:
  --ticket UUID --placa PLACA
  --json arquivo.json --placa PLACA

Variáveis de ambiente do utilizador: DETRAN_SC_AUTH, DETRAN_SC_EMPRESA [, DETRAN_SC_APP_VERSION]
`);
      return;
    }
  }

  if (jsonIn) {
    if (!placa) {
      console.error("Com --json é obrigatório informar --placa");
      process.exit(1);
    }
    printResumo(processarDespesasDetranSc(placa, JSON.parse(fs.readFileSync(path.resolve(jsonIn), "utf8")), { dryRun }));
    return;
  }

  if (ticket) {
    if (!placa) {
      console.error("Com --ticket é obrigatório informar --placa");
      process.exit(1);
    }
    const v = loadVeiculosParaSync(placa)[0]!;
    printResumo(await sincronizarDespesasPorTicketDetranSc(v.placa, ticket, { dryRun }));
    return;
  }

  if (placa) {
    const v = loadVeiculosParaSync(placa)[0]!;
    printResumo(await sincronizarDespesasVeiculoDetranSc(v.placa, v.renavam, { dryRun }));
    return;
  }

  console.log(
    dryRun
      ? "[dry-run] Sincronizando IPVA/Licenciamento (sem gravar parceiro-despesas.json)..."
      : "Sincronizando IPVA/Licenciamento DETRAN SC...",
  );
  const results = await sincronizarDespesasFrotaDetranSc({ dryRun, delayMs });
  let novos = 0;
  let atualizados = 0;
  for (const r of results) {
    printResumo(r);
    novos += r.novos;
    atualizados += r.atualizados;
  }
  console.log(`\nFrota: ${results.length} veículos | novos: ${novos} | atualizados: ${atualizados}`);

  ensureRelatoriosDirs();
  const outPath = path.join(RELATORIOS_SYNC_DIR, "_sync_ipva_licenciamento.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
    "utf8",
  );
  console.log(`Relatório: ${outPath}`);
}
