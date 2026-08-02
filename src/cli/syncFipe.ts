/**
 * Atualiza campos FIPE no PostgreSQL (frota ou --placa).
 *
 * Uso:
 *   npx tsx src/run.ts sync-fipe [--placa PLACA] [--faltantes]
 */
import { sincronizarFipeVeiculos } from "../lib/fipe/index.js";

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`Uso:
  sync-fipe [opções]

Opções:
  --placa PLACA   Só este veículo (mesmo inativo)
  --faltantes     Só veículos sem FIPE (não reconsulta quem já tem)

Por defeito: atualiza FIPE de todos os veículos no PostgreSQL (ativos e inativos).
Sempre grava — não há dry-run.

Equivalente legado: atualizar-fipe-veiculos
`);
    process.exit(0);
  }

  if (argv.includes("--dry-run")) {
    console.warn("[aviso] --dry-run ignorado no sync-fipe (sempre grava no PostgreSQL).");
  }

  const placaIdx = argv.indexOf("--placa");
  const placa = placaIdx >= 0 ? argv[placaIdx + 1] : undefined;
  const faltantes = argv.includes("--faltantes");

  try {
    const r = await sincronizarFipeVeiculos({
      placa: placa?.trim() || undefined,
      faltantes: faltantes && !placa?.trim(),
      onProgress: (p) => {
        if (p.done === 0 || p.done === p.total || p.done % 5 === 0) {
          console.log(`FIPE ${p.done}/${p.total} (${p.percent}%) · ok ${p.sucesso} · falhas ${p.falhas}`);
        }
      },
    });
    console.log(`\n=== FIPE (PostgreSQL) ===`);
    console.log(`total: ${r.total} | sucesso: ${r.sucesso} | falhas: ${r.falhas}`);
    if (r.falhas) {
      for (const linha of r.resultados.filter((x) => !x.ok)) {
        console.error(`  - ${linha.placa}: ${linha.erro}`);
      }
      process.exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
