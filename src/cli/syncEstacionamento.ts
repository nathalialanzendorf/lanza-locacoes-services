import fs from "node:fs";
import path from "node:path";

import {
  loadPlacasParaSync,
  processarAvisosJson,
  processarAvisosJsonLote,
  sincronizarEstacionamentoFrota,
  sincronizarEstacionamentoVeiculo,
  type SyncEstacionamentoResult,
} from "../lib/sigapay/syncEstacionamento.js";
import { RELATORIOS_SYNC_DIR, ensureRelatoriosDirs } from "../lib/relatoriosPaths.js";

function printResumo(r: SyncEstacionamentoResult): void {
  console.log(
    `${r.placa} | novos: ${r.novos} | atualizados: ${r.atualizados} | sem alteração: ${r.semAlteracao} | ignorados: ${r.ignorados}`,
  );
  for (const a of r.avisos) console.log(`  aviso: ${a}`);
}

export async function main(argv: string[]): Promise<void> {
  let placa: string | undefined;
  let dryRun = false;
  let jsonIn: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--placa" && argv[i + 1]) placa = argv[++i];
    else if (a === "--json" && argv[i + 1]) jsonIn = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log(`sync-estacionamento [--placa PLACA] [--dry-run] [--json arquivo.json]

Grava ACT/avisos EM ABERTO do SigaPay em database/cliente-despesas.json
(categoria "Estacionamento"); chave EST-{id}.

Modo offline (resposta capturada no DevTools):
  --json arquivo.json             processa TODAS as placas ativas
  --json arquivo.json --placa P   processa só a placa P

Variáveis: SIGAPAY_COOKIE + SIGAPAY_TOKEN (sessão DevTools) ou SIGAPAY_API_BASE + SIGAPAY_PATH_*.
Ver .cursor/tools/sigapay/reference.md
`);
      return;
    }
  }

  if (jsonIn && placa) {
    loadPlacasParaSync(placa);
    printResumo(await processarAvisosJson(placa, jsonIn, { dryRun }));
    return;
  }

  if (placa) {
    loadPlacasParaSync(placa);
    printResumo(await sincronizarEstacionamentoVeiculo(placa, { dryRun }));
    return;
  }

  console.log(
    dryRun
      ? "[dry-run] Processando estacionamento da frota..."
      : "Sincronizando ACT/avisos SigaPay...",
  );
  const results = jsonIn
    ? await processarAvisosJsonLote(jsonIn, { dryRun })
    : await sincronizarEstacionamentoFrota({ dryRun });

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
  const outPath = path.join(RELATORIOS_SYNC_DIR, "_sync_estacionamento.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ sincronizadoEm: new Date().toISOString(), results }, null, 2),
    "utf8",
  );
  console.log(`Relatório: ${outPath}`);
}
