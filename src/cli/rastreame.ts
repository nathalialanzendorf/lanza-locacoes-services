/**
 * CLI rastreame.com.br — motorista (usa lib em src/lib/rastreame/).
 */
import path from "node:path";

import { findMotorista, postMotorista } from "../lib/rastreame/motorista.js";

export async function main(argv: string[]): Promise<void> {
  if (argv.length < 1) {
    console.error(`Uso:
  rastreame check <cnh> ["nome"]
  rastreame add <cliente.json>`);
    process.exit(2);
  }
  const cmd = argv[0]!;
  if (cmd === "check") {
    const cnh = argv[1] ?? "";
    const nome = argv[2] ?? "";
    const m = await findMotorista(cnh, nome);
    console.log(
      m ? `JA CADASTRADO: ${m.nome} (id ${m.id})` : "NAO CADASTRADO",
    );
  } else if (cmd === "add") {
    await postMotorista(path.resolve(argv[1]!));
  } else {
    console.error("Comando desconhecido:", cmd);
    process.exit(2);
  }
}
