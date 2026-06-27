import fs from "node:fs";
import path from "node:path";

import {
  loadVeiculosParaSync,
  processarRespostaDetranSc,
  sincronizarMultasFrotaDetranSc,
  sincronizarMultasPorTicketDetranSc,
  sincronizarMultasVeiculoDetranSc,
  type SyncVeiculoResult,
} from "../lib/detranSc/syncVeiculo.js";
import { RELATORIOS_SYNC_DIR, ensureRelatoriosDirs } from "../lib/relatoriosPaths.js";

function printResumo(r: SyncVeiculoResult): void {
  console.log(
    `${r.placa} | novos: ${r.novos} | atualizados: ${r.atualizados} | sem alteração: ${r.semAlteracao} | histórico DETRAN: ${r.historico} | débitos parceiro ignorados: ${r.debitosIgnoradosProprietario}`,
  );
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
}

export async function main(argv: string[]): Promise<void> {
  let placa: string | undefined;
  let dryRun = false;
  let ticket: string | undefined;
  let jsonIn: string | undefined;
  let prazoDias = 90;
  let delayMs = 1500;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--placa" && argv[i + 1]) {
      placa = argv[++i];
    } else if (a === "--ticket" && argv[i + 1]) {
      ticket = argv[++i];
    } else if (a === "--json" && argv[i + 1]) {
      jsonIn = argv[++i];
    } else if (a === "--prazo-dias" && argv[i + 1]) {
      prazoDias = Number(argv[++i]);
    } else if (a === "--delay-ms" && argv[i + 1]) {
      delayMs = Number(argv[++i]);
    } else if (a === "-h" || a === "--help") {
      console.log(`sync-infracoes [--placa PLACA] [--dry-run] [--prazo-dias N] [--delay-ms N]

Opções alternativas (debug / resposta já capturada):
  --ticket UUID --placa PLACA     resposta-consulta com ticket do DevTools
  --json arquivo.json --placa PLACA   processar JSON salvo (sem chamar API)

Variáveis (.env): DETRAN_SC_AUTH, DETRAN_SC_EMPRESA [, DETRAN_SC_APP_VERSION]

Sem --placa: percorre todos os veículos em database/veiculos.json (placa + renavam).
`);
      return;
    }
  }

  if (jsonIn) {
    if (!placa) {
      console.error("Com --json é obrigatório informar --placa");
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(path.resolve(jsonIn), "utf8"));
    const r = processarRespostaDetranSc(placa, raw, { dryRun, prazoDias });
    printResumo(r);
    return;
  }

  if (ticket) {
    if (!placa) {
      console.error("Com --ticket é obrigatório informar --placa");
      process.exit(1);
    }
    const veiculos = loadVeiculosParaSync(placa);
    const v = veiculos[0]!;
    const r = await sincronizarMultasPorTicketDetranSc(v.placa, ticket, {
      dryRun,
      prazoDias,
    });
    printResumo(r);
    return;
  }

  if (placa) {
    const veiculos = loadVeiculosParaSync(placa);
    const v = veiculos[0]!;
    const r = await sincronizarMultasVeiculoDetranSc(v.placa, v.renavam, {
      dryRun,
      prazoDias,
    });
    printResumo(r);
    return;
  }

  console.log(
    dryRun
      ? "[dry-run] Sincronizando frota (sem gravar cliente-despesas.json)..."
      : "Sincronizando infrações DETRAN SC...",
  );
  const results = await sincronizarMultasFrotaDetranSc({
    dryRun,
    prazoDias,
    delayMs,
  });

  let novos = 0;
  let atualizados = 0;
  for (const r of results) {
    printResumo(r);
    novos += r.novos;
    atualizados += r.atualizados;
  }
  console.log(
    `\nFrota: ${results.length} veículos | novos: ${novos} | atualizados: ${atualizados}`,
  );

  ensureRelatoriosDirs();
  const outPath = path.join(RELATORIOS_SYNC_DIR, "_sync_infracoes.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
    "utf8",
  );
  console.log(`Relatório: ${outPath}`);
}
