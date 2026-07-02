import fs from "node:fs";
import path from "node:path";

import {
  confirmarCondutorClienteDespesa,
  editarClienteDespesa,
  excluirClienteDespesa,
  gravarClienteDespesa,
  loadClienteDespesasDb,
  type ClienteDespesaInput,
  type ClienteDespesaPatch,
  type ClienteDespesaRegistro,
} from "../lib/clienteDespesasDb.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

type LotePayload = {
  veiculoId: string;
  clienteDespesas?: ClienteDespesaInput[];
  /** @deprecated use clienteDespesas */
  infracoes?: ClienteDespesaInput[];
  /** @deprecated use clienteDespesas */
  multas?: ClienteDespesaInput[];
  prazoDias?: number;
  /** Replica no Rastreame após gravar (default true para categorias elegíveis). */
  syncRastreame?: boolean;
};

function loadClientesNomes(): Map<string, string> {
  const p = path.join(REPO_ROOT, "database", "clientes.json");
  const map = new Map<string, string>();
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
      clientes?: { id?: string; nome?: string }[];
    };
    for (const c of j.clientes ?? []) {
      if (c.id && c.nome) map.set(c.id, c.nome);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function printSyncHint(m: ClienteDespesaRegistro): void {
  if (m.rastreameId != null && m.rastreameId !== "") {
    console.log(`     → replicado no Rastreame (id=${m.rastreameId})`);
  }
}

function printResult(
  auto: string,
  r: Awaited<ReturnType<typeof gravarClienteDespesa>>,
  nomes: Map<string, string>,
): void {
  if (r.duplicado) {
    console.log(`[SKIP duplicado] ${auto}`);
    return;
  }
  const m = r.registro;
  const cond =
    m.condutorId != null
      ? nomes.get(m.condutorId) ?? m.condutorId
      : "(não identificado)";
  console.log(
    `[OK] ${m.autoInfracao} | ${m.categoria ?? "Infração"} | ${m.veiculoId} | R$ ${m.valorMulta.toFixed(2)} | ${m.dataAutuacao}`,
  );
  console.log(`     condutor sugerido: ${cond} | confirmado: ${m.condutorConfirmado}`);
  if (m.condutorContrato) console.log(`     condutor: ${m.condutorContrato}`);
  if (r.aviso) console.log(`     aviso: ${r.aviso}`);
  printSyncHint(m);
}

function printProximaParcela(m: ClienteDespesaRegistro): void {
  console.log(
    `[OK próxima parcela] ${m.autoInfracao} | ${m.descricao} | R$ ${m.valorMulta.toFixed(2)} | ${m.dataAutuacao}`,
  );
  printSyncHint(m);
}

export async function main(argv: string[]): Promise<void> {
  const sub = argv[0];
  const noSync = argv.includes("--no-sync-rastreame");
  const syncOpts = { syncRastreame: !noSync };

  if (sub === "confirmar") {
    const auto = argv[1];
    if (!auto) {
      console.error("Uso: gravar-cliente-despesa confirmar <autoInfracao> [condutorId]");
      process.exit(1);
    }
    const condutorId = argv[2] ?? undefined;
    const m = await confirmarCondutorClienteDespesa(auto, condutorId, syncOpts);
    if (!m) {
      console.error("Débito não encontrado:", auto);
      process.exit(1);
    }
    console.log(`Condutor confirmado: ${m.autoInfracao} (condutorId=${m.condutorId ?? "null"})`);
    printSyncHint(m);
    return;
  }

  if (sub === "editar") {
    const idOrAuto = argv[1];
    const patchPath = argv[2];
    if (!idOrAuto || !patchPath) {
      console.error("Uso: gravar-cliente-despesa editar <id|autoInfracao> <patch.json> [--no-sync-rastreame]");
      process.exit(1);
    }
    const patch = JSON.parse(fs.readFileSync(path.resolve(patchPath), "utf8")) as ClienteDespesaPatch;
    const r = await editarClienteDespesa(idOrAuto, patch, syncOpts);
    if (!r) {
      console.error("Débito não encontrado:", idOrAuto);
      process.exit(1);
    }
    const m = r.registro;
    console.log(`[OK editar] ${m.autoInfracao} | ${m.categoria} | R$ ${m.valorMulta}`);
    printSyncHint(m);
    if (r.proximaParcela) printProximaParcela(r.proximaParcela);
    return;
  }

  if (sub === "excluir") {
    const idOrAuto = argv[1];
    if (!idOrAuto) {
      console.error("Uso: gravar-cliente-despesa excluir <id|autoInfracao> [--no-sync-rastreame]");
      process.exit(1);
    }
    const m = await excluirClienteDespesa(idOrAuto, syncOpts);
    if (!m) {
      console.error("Débito não encontrado:", idOrAuto);
      process.exit(1);
    }
    console.log(`[OK excluir] ${m.autoInfracao} (ativo=false)`);
    printSyncHint(m);
    return;
  }

  const jsonPath = path.resolve(sub ?? "");
  if (!fs.existsSync(jsonPath)) {
    console.error(`Ficheiro não encontrado: ${jsonPath}`);
    console.error("Uso: gravar-cliente-despesa <lote.json> [--no-sync-rastreame]");
    console.error("     gravar-cliente-despesa confirmar <autoInfracao> [condutorId]");
    console.error("     gravar-cliente-despesa editar <id|auto> <patch.json>");
    console.error("     gravar-cliente-despesa excluir <id|auto>");
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as LotePayload;
  const items = payload.clienteDespesas ?? payload.infracoes ?? payload.multas;
  if (!payload.veiculoId || !Array.isArray(items)) {
    console.error("JSON inválido: requer veiculoId e clienteDespesas[]");
    process.exit(1);
  }

  const sync = payload.syncRastreame !== false && !noSync;
  const nomes = loadClientesNomes();
  let ok = 0;
  let skip = 0;

  for (const item of items) {
    const r = await gravarClienteDespesa(payload.veiculoId, item, {
      prazoDias: payload.prazoDias,
      syncRastreame: sync,
    });
    printResult(item.autoInfracao, r, nomes);
    if (r.duplicado) skip++;
    else {
      ok++;
      if (r.proximaParcela) printProximaParcela(r.proximaParcela);
    }
  }

  const db = loadClienteDespesasDb();
  console.log(
    `\nTotal em cliente-despesas.json: ${db.clienteDespesas.length} | novos: ${ok} | duplicados: ${skip}`,
  );
}
