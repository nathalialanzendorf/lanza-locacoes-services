import { defaultDocumentosRaiz, importarClientesCnh } from "../lib/importarClientesCnh.js";

export async function main(argv: string[]): Promise<void> {
  let raiz: string | undefined;
  let dryRun = false;
  let comRastreame = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") dryRun = true;
    else if (a === "--com-rastreame") comRastreame = true;
    else if (a === "--raiz" && argv[i + 1]) raiz = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log(`Uso:
  importar-clientes-cnh [--raiz "D:/Dropbox/Aluguel Carros"] [--dry-run] [--com-rastreame]

Varre pastas de contrato (DD.MM.AAAA - Nome) com arquivo CNH (.pdf, .jpg, .jpeg, .png…)
e grava em database/clientes.json.

Dados principais vêm do Contrato*.docx na mesma pasta (nome, CPF, endereço).
CNH-e em PDF costuma ser imagem — o número da CNH pode vir de --com-rastreame.

Padrão --raiz: config/lanza_paths.json → documentosRaiz
`);
      process.exit(0);
    }
  }

  const r = await importarClientesCnh({
    raiz: raiz ?? defaultDocumentosRaiz(),
    dryRun,
    comRastreame,
  });

  console.log(
    `\nPastas com CNH: ${r.pastasComCnh} | novos: ${r.importados} | atualizados: ${r.atualizados} | ignorados: ${r.ignorados.length}`,
  );
  if (r.ignorados.length > 0 && r.ignorados.length <= 30) {
    console.log("\nIgnorados:");
    for (const i of r.ignorados) console.log(`  - ${i.pasta}: ${i.motivo}`);
  } else if (r.ignorados.length > 30) {
    console.log(`\nIgnorados (primeiros 30 de ${r.ignorados.length}):`);
    for (const i of r.ignorados.slice(0, 30)) console.log(`  - ${i.pasta}: ${i.motivo}`);
  }
}
