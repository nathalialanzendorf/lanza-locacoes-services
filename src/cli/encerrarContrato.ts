import fs from "node:fs";
import path from "node:path";

import {
  calcularFechamentoContrato,
  formatarFechamentoTexto,
  type FechamentoInput,
} from "../lib/fecharContrato.js";

function parseArgs(argv: string[]): {
  jsonPath: string | null;
  pasta: string | null;
  encerramento: string | null;
  outJson: string | null;
  incluirTodasMultas: boolean;
} {
  let jsonPath: string | null = null;
  let pasta: string | null = null;
  let encerramento: string | null = null;
  let outJson: string | null = null;
  let incluirTodasMultas = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--encerramento" && argv[i + 1]) {
      encerramento = argv[++i]!;
    } else if (a === "--out" && argv[i + 1]) {
      outJson = argv[++i]!;
    } else if (a === "--incluir-todas-infracoes-placa" || a === "--incluir-todas-multas-placa") {
      incluirTodasMultas = true;
    } else if (!a.startsWith("-") && !jsonPath && !pasta) {
      if (a.endsWith(".json")) jsonPath = path.resolve(a);
      else pasta = path.resolve(a);
    }
  }
  return { jsonPath, pasta, encerramento, outJson, incluirTodasMultas };
}

export function main(argv: string[]): void {
  const { jsonPath, pasta, encerramento, outJson, incluirTodasMultas } = parseArgs(argv);

  let input: FechamentoInput;
  if (jsonPath) {
    input = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as FechamentoInput;
  } else if (pasta && encerramento) {
    input = {
      pastaContrato: pasta,
      dataEncerramento: encerramento,
      incluirTodasMultasPlaca: incluirTodasMultas,
    };
  } else {
    console.error(`Uso:
  encerrar-contrato <pasta-contrato> --encerramento DD/MM/AAAA [--incluir-todas-infracoes-placa] [--out relatorio.json]
  encerrar-contrato <entrada.json> [--out relatorio.json]

entrada.json:
  pastaContrato, dataEncerramento
  semanasPagas?: string[]
  infracoesPagasAuto?: string[]
  incluirTodasInfracoesPlaca?: boolean
  condutorId?: string
`);
    process.exit(1);
  }

  const result = calcularFechamentoContrato(input);
  const texto = formatarFechamentoTexto(result);
  console.log(texto);

  if (outJson) {
    fs.writeFileSync(outJson, JSON.stringify(result, null, 2), "utf8");
    console.log(`\nJSON -> ${outJson}`);
  }
}
