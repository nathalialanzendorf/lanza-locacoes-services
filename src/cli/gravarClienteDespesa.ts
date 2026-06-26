import fs from "node:fs";
import path from "node:path";

import {
  confirmarCondutorClienteDespesa,
  gravarClienteDespesa,
  loadClienteDespesasDb,
  type ClienteDespesaInput,
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

function printResult(
  auto: string,
  r: ReturnType<typeof gravarClienteDespesa>,
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
  if (m.condutorContrato) console.log(`     contrato: ${m.condutorContrato}`);
  if (r.aviso) console.log(`     aviso: ${r.aviso}`);
}

export function main(argv: string[]): void {
  const sub = argv[0];

  if (sub === "confirmar") {
    const auto = argv[1];
    if (!auto) {
      console.error("Uso: gravar-cliente-despesa confirmar <autoInfracao> [condutorId]");
      process.exit(1);
    }
    const condutorId = argv[2] ?? undefined;
    const m = confirmarCondutorClienteDespesa(auto, condutorId);
    if (!m) {
      console.error("Débito não encontrado:", auto);
      process.exit(1);
    }
    console.log(`Condutor confirmado: ${m.autoInfracao} (condutorId=${m.condutorId ?? "null"})`);
    return;
  }

  const jsonPath = path.resolve(sub ?? "");
  if (!fs.existsSync(jsonPath)) {
    console.error(`Ficheiro não encontrado: ${jsonPath}`);
    console.error("Uso: gravar-cliente-despesa <lote.json>");
    console.error("     gravar-cliente-despesa confirmar <autoInfracao> [condutorId]");
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as LotePayload;
  const items = payload.clienteDespesas ?? payload.infracoes ?? payload.multas;
  if (!payload.veiculoId || !Array.isArray(items)) {
    console.error("JSON inválido: requer veiculoId e clienteDespesas[]");
    process.exit(1);
  }

  const nomes = loadClientesNomes();
  let ok = 0;
  let skip = 0;

  for (const item of items) {
    const r = gravarClienteDespesa(payload.veiculoId, item, {
      prazoDias: payload.prazoDias,
    });
    printResult(item.autoInfracao, r, nomes);
    if (r.duplicado) skip++;
    else ok++;
  }

  const db = loadClienteDespesasDb();
  console.log(
    `\nTotal em cliente-despesas.json: ${db.clienteDespesas.length} | novos: ${ok} | duplicados: ${skip}`,
  );
}
