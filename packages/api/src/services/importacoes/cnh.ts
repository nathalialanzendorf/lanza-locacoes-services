import {
  defaultDocumentosRaiz,
  importarClientesCnh,
  listarPastasComCnh,
  type ImportarCnhResult,
} from "../../lib-imports.js";

export type ImportarCnhInput = {
  raiz?: string;
  dryRun?: boolean;
  comRastreame?: boolean;
};

export function previewImportacaoCnh(raiz?: string) {
  const root = raiz ?? defaultDocumentosRaiz();
  const pastas = listarPastasComCnh([root]);
  return {
    raiz: root,
    total: pastas.length,
    pastas: pastas.map((p) => ({
      pasta: p.pastaNome,
      cnhArquivo: p.cnhArquivo,
      contratoDocx: p.contratoDocx,
      dataPasta: p.dataPasta?.toISOString().slice(0, 10) ?? null,
    })),
  };
}

export async function executarImportacaoCnh(
  input: ImportarCnhInput = {},
): Promise<ImportarCnhResult> {
  return importarClientesCnh({
    raiz: input.raiz,
    dryRun: input.dryRun,
    comRastreame: input.comRastreame,
  });
}
