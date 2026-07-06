/**
 * Migra infrações existentes de database/cliente-despesas.json → database/infracoes.json.
 *
 * Idempotente por numeroAuto (case-insensitive). Não remove entradas de cliente-despesas.
 * Preenche `clienteDespesaId` quando encontra o débito espelhado.
 *
 * Uso:
 *   npx tsx scripts/backfillInfracoesFromClienteDespesas.ts --dry-run
 *   npx tsx scripts/backfillInfracoesFromClienteDespesas.ts
 */
import crypto from "node:crypto";

import {
  loadClienteDespesasDb,
} from "../src/lib/clienteDespesasDb.js";
import { isCategoriaInfracao } from "../src/lib/infracaoTitulo.js";
import {
  loadInfracoesDb,
  saveInfracoesDb,
  type InfracaoRegistro,
} from "../src/lib/infracoesDb.js";

function nowIso(): string {
  return new Date().toISOString();
}

function autoKey(s: string): string {
  return String(s).trim().toUpperCase();
}

function main(): void {
  const dry = process.argv.includes("--dry-run");
  const despesas = loadClienteDespesasDb();
  const infracoesDb = loadInfracoesDb();
  const byAuto = new Map(
    infracoesDb.infracoes.map((i) => [autoKey(i.numeroAuto), i]),
  );

  let total = 0;
  let novos = 0;
  let atualizados = 0;
  let vinculos = 0;

  for (const d of despesas.clienteDespesas) {
    if (!isCategoriaInfracao(d.categoria)) continue;
    if (!d.autoInfracao?.trim()) continue;
    total++;

    const numeroAuto = String(d.numeroAuto ?? d.autoInfracao).trim();
    const key = autoKey(numeroAuto);
    const ts = nowIso();
    const existente = byAuto.get(key);

    const registro: InfracaoRegistro = existente
      ? { ...existente }
      : {
          id: crypto.randomUUID(),
          numeroAuto,
          veiculoId: d.veiculoId,
          descricao: d.descricao,
          dataAutuacao: d.dataAutuacao,
          localInfracao: d.localInfracao,
          valor: d.valorMulta,
          valorMulta: d.valorMulta,
          situacao: d.situacao,
          dataLimiteDefesa: d.dataLimiteDefesa ?? d.limiteDefesa ?? "",
          limiteDefesa: d.limiteDefesa,
          dataVencimentoOriginal: d.dataVencimentoOriginal,
          convertidaEmDebito: d.convertidaEmDebito,
          quitadaDetran: d.quitadaDetran,
          statusInfracao: d.statusInfracao,
          statusDetran: d.statusDetran,
          condutorId: d.condutorId,
          condutorConfirmado: d.condutorConfirmado,
          condutorContrato: d.condutorContrato,
          condutorNaoIdentificado: d.condutorNaoIdentificado,
          revisarManual: d.revisarManual,
          revisarMotivo: d.revisarMotivo,
          pdfArquivo: d.pdfArquivo ?? null,
          clienteDespesaId: d.id,
          origem: d.origem?.includes("detran") ? "detran-sc" : "backfill-cliente-despesas",
          syncEm: null,
          cadastradoEm: d.cadastradoEm || ts,
          atualizadoEm: ts,
          ativo: d.ativo !== false,
        };

    if (existente) {
      let mudou = false;
      if (!registro.clienteDespesaId && d.id) {
        registro.clienteDespesaId = d.id;
        mudou = true;
        vinculos++;
      }
      if (!registro.pdfArquivo && d.pdfArquivo) {
        registro.pdfArquivo = d.pdfArquivo;
        mudou = true;
      }
      if (registro.condutorId !== d.condutorId && d.condutorId) {
        registro.condutorId = d.condutorId;
        mudou = true;
      }
      if (mudou) {
        registro.atualizadoEm = ts;
        byAuto.set(key, registro);
        atualizados++;
        console.log(`[atu] ${numeroAuto} | ${d.veiculoId}`);
      }
    } else {
      novos++;
      byAuto.set(key, registro);
      console.log(`[novo] ${numeroAuto} | ${d.veiculoId} | R$ ${d.valorMulta.toFixed(2)}`);
    }
  }

  if (!dry) {
    infracoesDb.infracoes = [...byAuto.values()];
    saveInfracoesDb(infracoesDb);
  }

  console.log(
    `\nInfrações em cliente-despesas: ${total} | ${dry ? "a criar" : "criadas"}: ${novos} | ${dry ? "a atualizar" : "atualizadas"}: ${atualizados} | vínculos clienteDespesaId: ${vinculos}`,
  );
  if (dry) console.log("(dry-run — nada gravado)");
}

main();
