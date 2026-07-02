/**
 * Espelho local do vínculo motorista↔rastreável (Rastreame) em clientes.json e veiculos.json.
 */
import {
  editarCliente,
  findClienteById,
  marcarClienteRastreameSyncOk,
  type ClienteRegistro,
} from "./clientesDb.js";
import {
  editarVeiculo,
  findVeiculoById,
  type VeiculoRegistro,
} from "./veiculosDb.js";

export type RastreameVinculoLocal = {
  veiculoId: string;
  placa?: string;
  rastreavelKey: string | number;
  vinculadoEm: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function persistirMotoristaKeyLocal(
  clienteId: string,
  motoristaKey: string | number,
  motoristaId?: string | number,
): ClienteRegistro | null {
  const cliente = findClienteById(clienteId);
  if (!cliente) return null;
  if (
    String(cliente.rastreameMotoristaKey ?? "") === String(motoristaKey) &&
    (motoristaId == null ||
      String(cliente.rastreameMotoristaId ?? "") === String(motoristaId))
  ) {
    return cliente;
  }
  return marcarClienteRastreameSyncOk(clienteId, motoristaKey, motoristaId) ?? cliente;
}

export function vincularClienteVeiculoLocal(
  clienteId: string,
  veiculo: VeiculoRegistro,
  rastreavelKey: string | number,
): { alterado: boolean; cliente: ClienteRegistro | null } {
  const cliente = findClienteById(clienteId);
  if (!cliente) return { alterado: false, cliente: null };

  const vinculos = [...(cliente.rastreameVinculos ?? [])];
  const idx = vinculos.findIndex((v) => v.veiculoId === veiculo.id);
  const novo: RastreameVinculoLocal = {
    veiculoId: veiculo.id,
    placa: veiculo.placa,
    rastreavelKey,
    vinculadoEm: nowIso(),
  };

  let alterado = false;
  if (idx >= 0) {
    const cur = vinculos[idx]!;
    if (
      String(cur.rastreavelKey) !== String(rastreavelKey) ||
      cur.placa !== veiculo.placa
    ) {
      vinculos[idx] = novo;
      alterado = true;
    }
  } else {
    vinculos.push(novo);
    alterado = true;
  }

  let atualizado = cliente;
  if (alterado) {
    atualizado =
      editarCliente(clienteId, { rastreameVinculos: vinculos, ativo: true }) ?? cliente;
  } else if (cliente.ativo === false) {
    atualizado = editarCliente(clienteId, { ativo: true }) ?? cliente;
    alterado = true;
  }

  const veiculoAtual = findVeiculoById(veiculo.id);
  if (veiculoAtual?.clienteVinculadoId !== clienteId) {
    editarVeiculo(veiculo.id, { clienteVinculadoId: clienteId });
    alterado = true;
  }

  return { alterado, cliente: findClienteById(clienteId) ?? atualizado };
}

export function desvincularClienteVeiculoLocal(
  clienteId: string,
  veiculoId: string,
): { alterado: boolean; cliente: ClienteRegistro | null } {
  const cliente = findClienteById(clienteId);
  if (!cliente) return { alterado: false, cliente: null };

  const antes = cliente.rastreameVinculos ?? [];
  const vinculos = antes.filter((v) => v.veiculoId !== veiculoId);
  let alterado = vinculos.length !== antes.length;

  let atualizado = cliente;
  if (alterado) {
    atualizado =
      editarCliente(clienteId, { rastreameVinculos: vinculos }) ?? cliente;
  }

  const veiculo = findVeiculoById(veiculoId);
  if (veiculo?.clienteVinculadoId === clienteId) {
    editarVeiculo(veiculoId, { clienteVinculadoId: null });
    alterado = true;
  }

  return { alterado, cliente: findClienteById(clienteId) ?? atualizado };
}
