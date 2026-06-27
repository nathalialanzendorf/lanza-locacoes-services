import { importarClientesRastreame } from "../lib/importarClientesRastreame.js";

export async function main(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");

  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(`Uso:
  importar-clientes-rastreame [--dry-run]

Lista motoristas em rastreame.com.br (/keek/rest/motorista) e grava em database/clientes.json.
Requer RASTREAME_AUTH (ou login/senha) no .env — ver .cursor/tools/rastreame/.

--dry-run  Mostra o que seria importado sem gravar.
`);
    process.exit(0);
  }

  const r = await importarClientesRastreame({ dryRun });
  console.log(
    `\nRastreame: ${r.totalRastreame} motoristas | novos: ${r.importados} | atualizados: ${r.atualizados} | ignorados: ${r.ignorados.length}`,
  );
  if (r.ignorados.length > 0) {
    console.log("\nIgnorados:");
    for (const i of r.ignorados) {
      console.log(`  - ${i.nome}: ${i.motivo}`);
    }
  }
  if (r.totalRastreame === 0) {
    console.error(
      "\n[aviso] Nenhum motorista retornado. Verifique RASTREAME_AUTH (token expirado?) ou RASTREAME_TLS_INSECURE=1 se TLS falhar.",
    );
    process.exit(1);
  }
}
