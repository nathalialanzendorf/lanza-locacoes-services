/**
 * Marca como pagas despesas de cliente ativas sem ATRASADO em descricao/titulo.
 * Uso: npx tsx scripts/marcar-despesas-sem-atrasado-pago.ts [--dry-run]
 */
import {
  loadClienteDespesasDb,
  saveClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "../src/lib/clienteDespesasDb.js";
import { closePgPool } from "../src/lib/postgres/index.js";
import { mirrorStoreIfNeeded } from "../src/lib/postgres/syncPostgresql.js";

function temAtrasado(d: ClienteDespesaRegistro): boolean {
  return (
    /ATRASADO/i.test(d.descricao ?? "") || /ATRASADO/i.test(d.titulo ?? "")
  );
}

const dryRun = process.argv.includes("--dry-run");

const db = loadClienteDespesasDb();
let updated = 0;
let skippedAtrasado = 0;
let skippedInativo = 0;
let alreadyPaid = 0;

for (const d of db.clienteDespesas) {
  if (d.ativo === false) {
    skippedInativo++;
    continue;
  }
  if (temAtrasado(d)) {
    skippedAtrasado++;
    continue;
  }
  if (d.paga === true && d.situacao === "Registrado") {
    alreadyPaid++;
    continue;
  }

  if (!dryRun) {
    d.paga = true;
    d.situacao = "Registrado";
    d.atualizadoEm = new Date().toISOString();
  }
  updated++;
}

if (!dryRun && updated > 0) {
  saveClienteDespesasDb(db);
  try {
    await mirrorStoreIfNeeded("cliente-despesas.json");
  } finally {
    await closePgPool();
  }
}

console.log(
  JSON.stringify(
    {
      dryRun,
      total: db.clienteDespesas.length,
      skippedInativo,
      skippedAtrasado,
      alreadyPaid,
      updated,
    },
    null,
    2,
  ),
);
