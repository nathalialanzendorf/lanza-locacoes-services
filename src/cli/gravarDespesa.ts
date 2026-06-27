import { gravarParceiroDespesaManual } from "../lib/parceiroDespesasDb.js";

export function main(argv: string[]): void {
  const categoria = argv[0]!;
  const valorRaw = argv[1]!;
  const data = argv[2]!;
  const placa = argv[3]!;
  const descricao = argv[4] ?? categoria;

  const r = gravarParceiroDespesaManual({
    placa,
    categoria,
    descricao,
    data,
    valor: valorRaw,
  });

  const aviso = r.aviso ? `  (${r.aviso})` : "";
  const dup = r.acao === "sem_alteracao" ? " [já existia]" : "";
  console.log(
    `Despesa ${r.acao}: ${r.registro.categoria} R$ ${r.registro.valor.toFixed(2)} em ${r.registro.data} -> ${r.registro.placa}${dup}${aviso}`,
  );
}
