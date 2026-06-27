import fs from "node:fs";
import path from "node:path";

import {
  editarCliente,
  excluirCliente,
  findClienteById,
  gravarCliente,
  isSyncRastreameEligible,
  type ClientePatch,
} from "../lib/clientesDb.js";
import { replicarClienteNoRastreame } from "../lib/rastreame/motoristasSync.js";

export async function main(argv: string[]): Promise<void> {
  const sub = argv[0];
  const noSync = argv.includes("--no-sync-rastreame");

  if (sub === "editar") {
    const idOrCpf = argv[1];
    const patchPath = argv[2];
    if (!idOrCpf || !patchPath) {
      console.error("Uso: merge-cliente editar <id|cpf> <patch.json> [--no-sync-rastreame]");
      process.exit(1);
    }
    const patch = JSON.parse(fs.readFileSync(path.resolve(patchPath), "utf8")) as ClientePatch;
    const c = editarCliente(idOrCpf, patch);
    if (!c) {
      console.error("Cliente não encontrado:", idOrCpf);
      process.exit(1);
    }
    console.log(`[OK editar] ${c.nome} (${c.cpf ?? c.id})`);
    await maybeSync(c, !noSync);
    return;
  }

  if (sub === "excluir") {
    const idOrCpf = argv[1];
    if (!idOrCpf) {
      console.error("Uso: merge-cliente excluir <id|cpf> [--no-sync-rastreame]");
      process.exit(1);
    }
    const c = excluirCliente(idOrCpf);
    if (!c) {
      console.error("Cliente não encontrado:", idOrCpf);
      process.exit(1);
    }
    console.log(`[OK excluir] ${c.nome} (ativo=false)`);
    await maybeSync(c, !noSync);
    return;
  }

  const p = path.resolve(sub ?? "");
  if (!fs.existsSync(p)) {
    console.error(`Ficheiro não encontrado: ${p}`);
    console.error("Uso: merge-cliente <cliente.json> [--no-sync-rastreame]");
    console.error("     merge-cliente editar <id|cpf> <patch.json>");
    console.error("     merge-cliente excluir <id|cpf>");
    process.exit(1);
  }

  const novo = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  const r = gravarCliente(novo);
  console.log(`Cliente ${r.acao === "novo" ? "cadastrado" : "atualizado"}: ${r.registro.nome} (id ${r.registro.id})`);
  await maybeSync(r.registro, !noSync);
}

async function maybeSync(
  c: Awaited<ReturnType<typeof gravarCliente>>["registro"],
  sync: boolean,
): Promise<void> {
  if (!sync || !isSyncRastreameEligible(c)) return;
  try {
    await replicarClienteNoRastreame(c);
    const atual = findClienteById(c.id);
    console.log(
      `     → replicado no Rastreame (key=${atual?.rastreameMotoristaKey ?? "novo"})`,
    );
  } catch (e) {
    console.error(
      `     [aviso] falha sync Rastreame: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
