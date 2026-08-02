/**
 * Atualiza FIPE no PostgreSQL (`lanza.veiculo_fipe`).
 * Uso: npx tsx src/run.ts atualizar-fipe-veiculos [--placa PLACA]
 */
import { sincronizarFipeVeiculos } from "../lib/fipe/index.js";

function parseArgs(argv: string[]): { placaFilter: string | null } {
  let placaFilter: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--placa" && argv[i + 1]) {
      placaFilter = argv[i + 1]!;
      i++;
    }
  }
  return { placaFilter };
}

/** Chamado após cadastrar veículo — não encerra o processo em falha FIPE. */
export async function syncFipeNovoVeiculo(placa: string): Promise<void> {
  if (!placa?.trim()) return;
  try {
    const r = await sincronizarFipeVeiculos({ placa: placa.trim() });
    if (r.falhas) {
      console.error("[aviso] FIPE sync com falhas:", r.resultados.filter((x) => !x.ok));
    } else {
      console.log("[fipe] campos FIPE atualizados no PostgreSQL");
    }
  } catch (e) {
    console.error("[aviso] FIPE sync:", e instanceof Error ? e.message : String(e));
  }
}

export async function main(argv: string[]): Promise<void> {
  const { placaFilter } = parseArgs(argv);
  try {
    const r = await sincronizarFipeVeiculos({
      placa: placaFilter ?? undefined,
      onProgress: (p) => {
        if (p.done === 0 || p.done === p.total || p.done % 5 === 0) {
          console.log(`FIPE ${p.done}/${p.total} (${p.percent}%) · ok ${p.sucesso} · falhas ${p.falhas}`);
        }
      },
    });
    console.log(`\nConcluído: ${r.sucesso} ok, ${r.falhas} falhas de ${r.total}`);
    if (r.falhas) {
      for (const linha of r.resultados.filter((x) => !x.ok)) {
        console.error("ERRO", linha.placa, linha.erro);
      }
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
