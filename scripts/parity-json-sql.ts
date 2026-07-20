import fs from "node:fs";
import path from "node:path";

import { closePgPool, DATABASE_DIR, pgQuery } from "@lanza/db";

type CountSpec = {
  store: string;
  jsonFile: string;
  jsonKey: string;
  sql: string;
};

const SPECS: CountSpec[] = [
  { store: "parceiros", jsonFile: "parceiros.json", jsonKey: "parceiros", sql: "SELECT COUNT(*)::text AS c FROM lanza.parceiros" },
  { store: "veiculos", jsonFile: "veiculos.json", jsonKey: "veiculos", sql: "SELECT COUNT(*)::text AS c FROM lanza.veiculos" },
  { store: "parceiro_veiculo", jsonFile: "parceiro-veiculo.json", jsonKey: "vinculos", sql: "SELECT COUNT(*)::text AS c FROM lanza.parceiro_veiculo_vinculos" },
  { store: "clientes", jsonFile: "clientes.json", jsonKey: "clientes", sql: "SELECT COUNT(*)::text AS c FROM lanza.clientes" },
  { store: "contratos", jsonFile: "contratos.json", jsonKey: "contratos", sql: "SELECT COUNT(*)::text AS c FROM lanza.contratos" },
  { store: "locacoes", jsonFile: "locacoes.json", jsonKey: "locacoes", sql: "SELECT COUNT(*)::text AS c FROM lanza.locacoes" },
  { store: "infracoes", jsonFile: "infracoes.json", jsonKey: "infracoes", sql: "SELECT COUNT(*)::text AS c FROM lanza.infracoes" },
  { store: "cliente_despesas", jsonFile: "cliente-despesas.json", jsonKey: "clienteDespesas", sql: "SELECT COUNT(*)::text AS c FROM lanza.cliente_despesas" },
  { store: "parceiro_despesas", jsonFile: "parceiro-despesas.json", jsonKey: "parceiroDespesas", sql: "SELECT COUNT(*)::text AS c FROM lanza.parceiro_despesas" },
  {
    store: "cliente_analise_cadastro",
    jsonFile: "analise-cadastro.json",
    jsonKey: "triagens",
    sql: "SELECT COUNT(*)::text AS c FROM lanza.cliente_analise_cadastro",
  },
];

function jsonCount(databaseDir: string, file: string, key: string): number | null {
  const full = path.join(databaseDir, file);
  if (!fs.existsSync(full)) return null;
  const data = JSON.parse(fs.readFileSync(full, "utf8")) as Record<string, unknown>;
  const arr = data[key];
  return Array.isArray(arr) ? arr.length : 0;
}

/** Linhas esperadas em `cliente_analise_cadastro` (UK cpf × origem × data). */
function jsonAnaliseCadastroCount(databaseDir: string): number | null {
  const keys = new Set<string>();
  let found = false;

  const triagemPath = path.join(databaseDir, "analise-cadastro.json");
  if (fs.existsSync(triagemPath)) {
    found = true;
    const data = JSON.parse(fs.readFileSync(triagemPath, "utf8")) as {
      triagens?: { cpf?: string; dataConsulta?: string; fontes?: { id?: string }[] }[];
    };
    for (const t of data.triagens ?? []) {
      const cpf = String(t.cpf ?? "").replace(/\D/g, "");
      const dataConsulta = String(t.dataConsulta ?? "");
      const fontes = t.fontes;
      if (Array.isArray(fontes) && fontes.length > 0) {
        for (const f of fontes) {
          const origem = String(f.id ?? "fonte");
          keys.add(`${cpf}|${origem}|${dataConsulta}`);
        }
      } else if (dataConsulta) {
        keys.add(`${cpf}|triagem|${dataConsulta}`);
      }
    }
  }

  const regPath = path.join(databaseDir, "cliente-analise.json");
  if (fs.existsSync(regPath)) {
    found = true;
    const data = JSON.parse(fs.readFileSync(regPath, "utf8")) as {
      registros?: { cpf?: string; fonte?: string; dataConsulta?: string }[];
    };
    for (const r of data.registros ?? []) {
      const cpf = String(r.cpf ?? "").replace(/\D/g, "");
      const origem = String(r.fonte ?? "?");
      const dataConsulta = String(r.dataConsulta ?? "");
      keys.add(`${cpf}|${origem}|${dataConsulta}`);
    }
  }

  return found ? keys.size : null;
}

async function main(): Promise<void> {
  const databaseDir = process.env.LANZA_DATABASE_DIR?.trim() || DATABASE_DIR;
  console.log(`Paridade JSON vs SQL (database: ${databaseDir})\n`);
  console.log("Store".padEnd(22), "JSON".padStart(8), "SQL".padStart(8), "OK".padStart(6));
  console.log("-".repeat(46));

  let allOk = true;
  for (const spec of SPECS) {
    const json =
      spec.store === "cliente_analise_cadastro"
        ? jsonAnaliseCadastroCount(databaseDir)
        : jsonCount(databaseDir, spec.jsonFile, spec.jsonKey);
    let sql: number | null = null;
    try {
      const r = await pgQuery<{ c: string }>(spec.sql);
      sql = Number.parseInt(r.rows[0]?.c ?? "0", 10);
    } catch {
      sql = null;
    }
    const ok = json != null && sql != null && json === sql;
    if (!ok) allOk = false;
    console.log(
      spec.store.padEnd(22),
      String(json ?? "?").padStart(8),
      String(sql ?? "?").padStart(8),
      (ok ? "sim" : "NÃO").padStart(6),
    );
  }

  const despesasAbertoJson = jsonCount(databaseDir, "cliente-despesas.json", "clienteDespesas");
  if (despesasAbertoJson != null) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(databaseDir, "cliente-despesas.json"), "utf8"),
    ) as { clienteDespesas?: { paga?: boolean; ativo?: boolean; valorMulta?: number }[] };
    const emAbertoJson = (raw.clienteDespesas ?? []).filter(
      (d) => d.ativo !== false && !d.paga,
    ).length;
    const emAbertoSql = await pgQuery<{ c: string }>(
      "SELECT COUNT(*)::text AS c FROM lanza.cliente_despesas WHERE ativo = true AND paga = false",
    );
    const sqlN = Number.parseInt(emAbertoSql.rows[0]?.c ?? "0", 10);
    const ok = emAbertoJson === sqlN;
    if (!ok) allOk = false;
    console.log("-".repeat(46));
    console.log(
      "despesas_em_aberto".padEnd(22),
      String(emAbertoJson).padStart(8),
      String(sqlN).padStart(8),
      (ok ? "sim" : "NÃO").padStart(6),
    );
  }

  console.log(allOk ? "\nParidade OK." : "\nDiferenças encontradas — rever importação.");
  process.exit(allOk ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePgPool());
