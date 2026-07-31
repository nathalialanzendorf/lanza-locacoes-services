import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]!]) process.env[m[1]!] = val;
  }
}

process.env.VERCEL = "1";

import { closePgPool, pgQuery } from "@lanza/db";

async function main() {
  const r = await pgQuery<{
    total: number;
    sem_veiculo_id: number;
    abertas_sem_veiculo_id: number;
  }>(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE veiculo_id IS NULL)::int AS sem_veiculo_id,
      COUNT(*) FILTER (WHERE veiculo_id IS NULL AND ativo = true AND paga = false)::int AS abertas_sem_veiculo_id
     FROM lanza.cliente_despesas`,
    [],
    "audit-sem-veiculo-id",
  );
  console.log("TOTAIS:", JSON.stringify(r.rows[0], null, 2));

  const sample = await pgQuery(
    `SELECT cd.id, cd.auto_infracao, v.placa, cd.categoria, cd.descricao, cd.condutor_id, cd.ativo, cd.paga
     FROM lanza.cliente_despesas cd
     LEFT JOIN lanza.veiculos v ON v.id = cd.veiculo_id
     WHERE cd.veiculo_id IS NULL
     ORDER BY cd.data_autuacao DESC
     LIMIT 15`,
    [],
    "sample-sem-veiculo-id",
  );
  console.log("AMOSTRA (até 15):", JSON.stringify(sample.rows, null, 2));

  const alvo = await pgQuery(
    `SELECT cd.id, cd.veiculo_id, v.placa, cd.categoria, cd.descricao, cd.condutor_id, cd.ativo, cd.paga, cd.valor_multa
     FROM lanza.cliente_despesas cd
     LEFT JOIN lanza.veiculos v ON v.id = cd.veiculo_id
     WHERE cd.id = $1`,
    ["5ae8409b-a673-4f83-b371-744ab8eb8ee6"],
    "despesa-alvo",
  );
  console.log("DESPESA TESTE:", JSON.stringify(alvo.rows[0] ?? null, null, 2));
}

main()
  .catch((err) => {
    console.error("ERRO:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePgPool());
