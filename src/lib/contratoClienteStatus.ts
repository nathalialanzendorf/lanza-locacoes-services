/**
 * (Des)ativação do cliente e vínculo motorista↔rastreável ligados ao ciclo de vida do contrato.
 *
 * Regra de negócio (cadastro-contrato):
 * - Ao **gerar**: ativa cliente, persiste `rastreameMotoristaKey`, vincula em `clientes.json`
 *   (`rastreameVinculos`) e `veiculos.json` (`clienteVinculadoId`); espelha no Rastreame.
 * - Ao **encerrar**: remove vínculo local e remoto; inativa cliente local + Rastreame — exceto
 *   se ainda tiver **outro contrato ativo**.
 *
 * O database local é fonte da verdade; o Rastreame é best-effort (falha → `[aviso]`).
 */
import {
  editarCliente,
  findClienteById,
  findClienteByCpf,
  normNomeKey,
  type ClienteRegistro,
} from "./clientesDb.js";
import {
  desvincularClienteVeiculoLocal,
  persistirMotoristaKeyLocal,
  vincularClienteVeiculoLocal,
} from "./contratoVinculoDb.js";
import { loadContratosDb } from "./contratosDb.js";
import { normCpfKey } from "./rastreame/mapMotoristaCliente.js";
import {
  ativarMotorista,
  desvincularMotoristaRastreavel,
  fetchAllMotoristas,
  fetchMotoristaByKey,
  findMotorista,
  inativarMotorista,
  vincularMotoristaRastreavel,
} from "./rastreame/motorista.js";
import { replicarClienteNoRastreame } from "./rastreame/motoristasSync.js";
import {
  findVeiculoById,
  findVeiculoByPlaca,
  type VeiculoRegistro,
} from "./veiculosDb.js";

export type ClienteContratoRef = {
  clienteId?: string | null;
  cpf?: string | null;
  nome?: string | null;
  placa?: string | null;
  veiculoId?: string | null;
};

export type StatusClienteResult = {
  cliente: ClienteRegistro | null;
  /** Ação aplicada no database local (ativo). */
  local: "ativado" | "inativado" | "sem_alteracao" | "nao_encontrado";
  /** Ação no motorista Rastreame. */
  rastreame: "ativado" | "inativado" | "ignorado" | "erro";
  /** Vínculo motorista↔rastreável (local + remoto). */
  vinculo: "vinculado" | "desvinculado" | "ignorado" | "erro";
  aviso?: string;
};

function resolverCliente(ref: ClienteContratoRef): ClienteRegistro | null {
  if (ref.clienteId) {
    const c = findClienteById(ref.clienteId);
    if (c) return c;
  }
  if (ref.cpf) {
    const c = findClienteByCpf(ref.cpf);
    if (c) return c;
  }
  return null;
}

function resolverVeiculo(ref: ClienteContratoRef): VeiculoRegistro | null {
  if (ref.veiculoId) {
    const v = findVeiculoById(ref.veiculoId);
    if (v) return v;
  }
  if (ref.placa) return findVeiculoByPlaca(ref.placa);
  return null;
}

function resolverRastreavelKey(ref: ClienteContratoRef, veiculo?: VeiculoRegistro | null): string | null {
  const v = veiculo ?? resolverVeiculo(ref);
  const key = v?.rastreameRastreavelKey;
  return key != null && key !== "" ? String(key) : null;
}

function mesmoCliente(
  contratoClienteId: string | null,
  contratoCpf: string | null,
  contratoNome: string,
  cliente: ClienteRegistro,
): boolean {
  if (contratoClienteId && cliente.id && contratoClienteId === cliente.id) return true;
  if (contratoCpf && cliente.cpf && normCpfKey(contratoCpf) === normCpfKey(String(cliente.cpf))) {
    return true;
  }
  return Boolean(contratoNome && normNomeKey(contratoNome) === normNomeKey(cliente.nome));
}

/** true se o cliente tem outro contrato ativo além de `excetoContratoId`. */
export function temOutroContratoAtivo(
  cliente: ClienteRegistro,
  excetoContratoId?: string | null,
): boolean {
  const db = loadContratosDb();
  return db.contratos.some(
    (c) =>
      c.status === "ativo" &&
      c.id !== excetoContratoId &&
      mesmoCliente(c.clienteId, c.cpf, c.clienteNome, cliente),
  );
}

async function resolverMotoristaKey(cliente: ClienteRegistro): Promise<string | null> {
  if (cliente.rastreameMotoristaKey != null && cliente.rastreameMotoristaKey !== "") {
    return String(cliente.rastreameMotoristaKey);
  }

  const cnh = cliente.cnh as { numero?: string; numeroRegistro?: string } | undefined;
  const cnhNum = String(cnh?.numero ?? cnh?.numeroRegistro ?? "");
  const porNomeCnh = await findMotorista(cnhNum, cliente.nome ?? "");
  if (porNomeCnh) {
    const key = String(porNomeCnh.key ?? porNomeCnh.id ?? "");
    if (key) return key;
  }

  if (cliente.cpf) {
    const cpfD = normCpfKey(cliente.cpf);
    for (const m of await fetchAllMotoristas()) {
      if (m.cpf && normCpfKey(String(m.cpf)) === cpfD) {
        const key = String(m.key ?? m.id ?? "");
        if (key) return key;
      }
    }
  }

  return null;
}

async function garantirMotoristaNoRastreame(
  cliente: ClienteRegistro,
  opts: { dryRun?: boolean },
): Promise<{ key: string | null; motoristaId?: string | number; aviso?: string }> {
  let key = await resolverMotoristaKey(cliente);
  let motoristaId: string | number | undefined;

  if (key) {
    if (!opts.dryRun) {
      persistirMotoristaKeyLocal(cliente.id, key);
    }
    return { key };
  }

  if (opts.dryRun) {
    return { key: null, aviso: "motorista não encontrado no Rastreame (dry-run)" };
  }

  try {
    await replicarClienteNoRastreame({ ...cliente, ativo: true });
    const atualizado = findClienteById(cliente.id) ?? cliente;
    key = await resolverMotoristaKey(atualizado);
    motoristaId = atualizado.rastreameMotoristaId ?? undefined;
    if (key) {
      persistirMotoristaKeyLocal(atualizado.id, key, motoristaId);
      return { key, motoristaId };
    }
    return { key: null, aviso: "motorista não encontrado após replicação" };
  } catch (e) {
    return {
      key: null,
      aviso: `Rastreame não atualizado (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/**
 * Reativa o cliente (local + Rastreame), persiste motorista e vincula ao rastreável.
 */
export async function ativarClienteDoContrato(
  ref: ClienteContratoRef,
  opts: { dryRun?: boolean } = {},
): Promise<StatusClienteResult> {
  const cliente = resolverCliente(ref);
  if (!cliente) {
    return { cliente: null, local: "nao_encontrado", rastreame: "ignorado", vinculo: "ignorado" };
  }

  const veiculo = resolverVeiculo(ref);
  const rastreavelKey = resolverRastreavelKey(ref, veiculo);

  let local: StatusClienteResult["local"] = "sem_alteracao";
  let atualizado = cliente;
  if (cliente.ativo === false) {
    if (opts.dryRun) {
      local = "ativado";
    } else {
      atualizado = editarCliente(cliente.id, { ativo: true }) ?? cliente;
      local = "ativado";
    }
  }

  if (opts.dryRun) {
    return {
      cliente: atualizado,
      local,
      rastreame: "ativado",
      vinculo: veiculo && rastreavelKey ? "vinculado" : "ignorado",
      aviso: !rastreavelKey ? "veículo sem rastreameRastreavelKey — vínculo não aplicado" : undefined,
    };
  }

  const avisos: string[] = [];
  let rastreame: StatusClienteResult["rastreame"] = "ignorado";
  let vinculo: StatusClienteResult["vinculo"] = "ignorado";

  const { key: motoristaKey, aviso: avisoMotorista } = await garantirMotoristaNoRastreame(
    atualizado,
    opts,
  );
  if (avisoMotorista) avisos.push(avisoMotorista);
  atualizado = findClienteById(atualizado.id) ?? atualizado;

  if (veiculo && rastreavelKey) {
    const loc = vincularClienteVeiculoLocal(atualizado.id, veiculo, rastreavelKey);
    atualizado = loc.cliente ?? atualizado;
    vinculo = "vinculado";
  } else {
    avisos.push("veículo sem rastreameRastreavelKey — vínculo local/remoto não aplicado");
  }

  if (motoristaKey) {
    try {
      const remoto = await fetchMotoristaByKey(motoristaKey);
      if (remoto.ativo === false) {
        await ativarMotorista(motoristaKey);
        rastreame = "ativado";
      }
      persistirMotoristaKeyLocal(
        atualizado.id,
        motoristaKey,
        remoto.id ?? remoto.key ?? undefined,
      );
    } catch (e) {
      rastreame = "erro";
      avisos.push(`Rastreame ativar motorista: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (rastreavelKey && vinculo !== "ignorado") {
      try {
        await vincularMotoristaRastreavel(motoristaKey, rastreavelKey);
        vinculo = "vinculado";
      } catch (e) {
        if (vinculo !== "vinculado") vinculo = "erro";
        avisos.push(`Rastreame vínculo motorista/veículo: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    avisos.push("cliente sem rastreameMotoristaKey");
  }

  return {
    cliente: findClienteById(atualizado.id) ?? atualizado,
    local,
    rastreame,
    vinculo,
    aviso: avisos.length ? avisos.join("; ") : undefined,
  };
}

/**
 * Remove vínculo (local + Rastreame) e inativa o cliente — exceto se ainda
 * houver outro contrato ativo para o mesmo cliente.
 */
export async function desativarClienteDoContrato(
  ref: ClienteContratoRef & { contratoId?: string | null },
  opts: { dryRun?: boolean } = {},
): Promise<StatusClienteResult> {
  const cliente = resolverCliente(ref);
  if (!cliente) {
    return { cliente: null, local: "nao_encontrado", rastreame: "ignorado", vinculo: "ignorado" };
  }

  const veiculo = resolverVeiculo(ref);
  const rastreavelKey = resolverRastreavelKey(ref, veiculo);
  const motoristaKey = await resolverMotoristaKey(cliente);
  const outroAtivo = temOutroContratoAtivo(cliente, ref.contratoId);

  if (opts.dryRun) {
    return {
      cliente,
      local: outroAtivo ? "sem_alteracao" : "inativado",
      rastreame: outroAtivo ? "ignorado" : "inativado",
      vinculo: veiculo ? "desvinculado" : "ignorado",
      aviso: outroAtivo ? "cliente tem outro contrato ativo — mantido ativo" : undefined,
    };
  }

  const avisos: string[] = [];
  let vinculo: StatusClienteResult["vinculo"] = "ignorado";
  let atualizado = cliente;

  if (veiculo) {
    const loc = desvincularClienteVeiculoLocal(cliente.id, veiculo.id);
    atualizado = loc.cliente ?? cliente;
    vinculo = "desvinculado";
  } else {
    avisos.push("veículo não encontrado — desvínculo local não aplicado");
  }

  if (motoristaKey && rastreavelKey) {
    try {
      await desvincularMotoristaRastreavel(motoristaKey, rastreavelKey);
      vinculo = "desvinculado";
    } catch (e) {
      if (vinculo !== "desvinculado") vinculo = "erro";
      avisos.push(`Rastreame desvincular: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!rastreavelKey) {
    avisos.push("veículo sem rastreameRastreavelKey — desvínculo Rastreame não aplicado");
  } else if (!motoristaKey) {
    avisos.push("cliente sem rastreameMotoristaKey — desvínculo Rastreame não aplicado");
  }

  if (outroAtivo) {
    return {
      cliente: atualizado,
      local: "sem_alteracao",
      rastreame: "ignorado",
      vinculo,
      aviso: avisos.length
        ? `cliente tem outro contrato ativo — mantido ativo; ${avisos.join("; ")}`
        : "cliente tem outro contrato ativo — mantido ativo",
    };
  }

  if (atualizado.ativo === false) {
    return {
      cliente: atualizado,
      local: "sem_alteracao",
      rastreame: "ignorado",
      vinculo,
      aviso: avisos.length ? avisos.join("; ") : undefined,
    };
  }

  atualizado = editarCliente(atualizado.id, { ativo: false }) ?? atualizado;
  let rastreame: StatusClienteResult["rastreame"] = "ignorado";

  if (motoristaKey) {
    try {
      await inativarMotorista(motoristaKey);
      rastreame = "inativado";
    } catch (e) {
      rastreame = "erro";
      avisos.push(`Rastreame inativar motorista: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    cliente: atualizado,
    local: "inativado",
    rastreame,
    vinculo,
    aviso: avisos.length ? avisos.join("; ") : undefined,
  };
}
