/**
 * Lança rastreador fixo mensal em parceiro-despesas.json (todos os veículos cadastrados).
 *
 * Regra: R$ 50,00 — vencimento dia 10. Idempotente.
 */
import {
  competenciaAtual,
  RASTREADOR_DIA_PADRAO,
  RASTREADOR_VALOR_PADRAO,
  syncRastreadorFixo,
} from "../lib/rastreadorFixo.js";

export function main(argv: string[]): void {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`Uso:
  sync-rastreador [--desde MM/AAAA] [--ate MM/AAAA] [--dry-run]

Regra fixa (todos os veículos em veiculos.json):
  valor: R$ ${RASTREADOR_VALOR_PADRAO.toFixed(2)} por mês
  data: dia ${RASTREADOR_DIA_PADRAO} da competência
  origem: rastreador-fixo/{PLACA}/{MM-AAAA} (dedupe)

Por defeito: --desde 01/2026 --ate ${competenciaAtual()}
`);
    process.exit(0);
  }

  let desde = "01/2026";
  let ate = competenciaAtual();
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--desde" && argv[i + 1]) desde = argv[++i]!;
    else if (a === "--ate" && argv[i + 1]) ate = argv[++i]!;
    else if (a === "--dry-run") dryRun = true;
  }

  const r = syncRastreadorFixo({ desde, ate, dryRun });
  const prefix = dryRun ? "[dry-run] " : "";
  console.log(
    `${prefix}Rastreador: ${r.veiculos} veículo(s) × ${r.competencias.length} mês(es) (${desde} → ${ate})`,
  );
  console.log(
    `${prefix}${r.novos} novos | ${r.atualizados} atualizados | ${r.semAlteracao} sem alteração` +
      (r.duplicatasRemovidas ? ` | ${r.duplicatasRemovidas} duplicata(s) removida(s)` : ""),
  );
}
