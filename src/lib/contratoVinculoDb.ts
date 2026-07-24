/**
 * Espelho local do vínculo motorista↔rastreável (Rastreame) em clientes.json e veiculos.json.
 */
import {
  editarCliente,
  editarClienteAsync,
  findClienteById,
  loadClientesDbAsync,
  marcarClienteRastreameSyncOk,
  marcarClienteRastreameSyncOkAsync,
  type ClienteRegistro,
} from "./clientesDb.js";
import {
  editarVeiculo,
  editarVeiculoAsync,
  findVeiculoById,
  loadVeiculosDbAsync,
  type VeiculoRegistro,
} from "./veiculosDb.js";
import { useRelationalStore } from "@lanza/db";

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

export async function persistirMotoristaKeyLocalAsync(
  clienteId: string,
  motoristaKey: string | number,
  motoristaId?: string | number,
): Promise<ClienteRegistro | null> {
  if (await useRelationalStore()) {
    const db = await loadClientesDbAsync({ ids: [clienteId] });
    const cliente = db.clientes.find((c) => c.id === clienteId) ?? null;
    if (!cliente) return null;
    if (
      String(cliente.rastreameMotoristaKey ?? "") === String(motoristaKey) &&
      (motoristaId == null ||
        String(cliente.rastreameMotoristaId ?? "") === String(motoristaId))
    ) {
      return cliente;
    }
    return (
      (await marcarClienteRastreameSyncOkAsync(clienteId, motoristaKey, motoristaId)) ?? cliente
    );
  }
  return persistirMotoristaKeyLocal(clienteId, motoristaKey, motoristaId);
}

function applyVinculoClienteVeiculo(
  cliente: ClienteRegistro,
  veiculo: VeiculoRegistro,
  rastreavelKey: string | number,
): { alterado: boolean; patchCliente?: { rastreameVinculos: RastreameVinculoLocal[]; ativo: true }; patchAtivo?: true } {
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

  if (alterado) {
    return { alterado: true, patchCliente: { rastreameVinculos: vinculos, ativo: true } };
  }
  if (cliente.ativo === false) {
    return { alterado: true, patchAtivo: true };
  }
  return { alterado: false };
}

export function vincularClienteVeiculoLocal(
  clienteId: string,
  veiculo: VeiculoRegistro,
  rastreavelKey: string | number,
): { alterado: boolean; cliente: ClienteRegistro | null } {
  const cliente = findClienteById(clienteId);
  if (!cliente) return { alterado: false, cliente: null };

  const r = applyVinculoClienteVeiculo(cliente, veiculo, rastreavelKey);
  let alterado = r.alterado;
  let atualizado = cliente;

  if (r.patchCliente) {
    atualizado = editarCliente(clienteId, r.patchCliente) ?? cliente;
  } else if (r.patchAtivo) {
    atualizado = editarCliente(clienteId, { ativo: true }) ?? cliente;
  }

  const veiculoAtual = findVeiculoById(veiculo.id);
  if (veiculoAtual?.clienteVinculadoId !== clienteId) {
    editarVeiculo(veiculo.id, { clienteVinculadoId: clienteId });
    alterado = true;
  }

  return { alterado, cliente: findClienteById(clienteId) ?? atualizado };
}

export async function vincularClienteVeiculoLocalAsync(
  clienteId: string,
  veiculo: VeiculoRegistro,
  rastreavelKey: string | number,
): Promise<{ alterado: boolean; cliente: ClienteRegistro | null }> {
  if (await useRelationalStore()) {
    const db = await loadClientesDbAsync({ ids: [clienteId] });
    const cliente = db.clientes.find((c) => c.id === clienteId) ?? null;
    if (!cliente) return { alterado: false, cliente: null };

    const r = applyVinculoClienteVeiculo(cliente, veiculo, rastreavelKey);
    let alterado = r.alterado;
    let atualizado = cliente;

    if (r.patchCliente) {
      atualizado = (await editarClienteAsync(clienteId, r.patchCliente)) ?? cliente;
    } else if (r.patchAtivo) {
      atualizado = (await editarClienteAsync(clienteId, { ativo: true })) ?? cliente;
    }

    const veiculosDb = await loadVeiculosDbAsync({ veiculoId: veiculo.id });
    const veiculoAtual = veiculosDb.veiculos.find((v) => v.id === veiculo.id) ?? null;
    if (veiculoAtual?.clienteVinculadoId !== clienteId) {
      await editarVeiculoAsync(veiculo.id, { clienteVinculadoId: clienteId });
      alterado = true;
    }

    const refreshedDb = await loadClientesDbAsync({ ids: [clienteId] });
    const refreshed = refreshedDb.clientes.find((c) => c.id === clienteId) ?? atualizado;
    return { alterado, cliente: refreshed };
  }
  return vincularClienteVeiculoLocal(clienteId, veiculo, rastreavelKey);
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
    atualizado = editarCliente(clienteId, { rastreameVinculos: vinculos }) ?? cliente;
  }

  const veiculo = findVeiculoById(veiculoId);
  if (veiculo?.clienteVinculadoId === clienteId) {
    editarVeiculo(veiculoId, { clienteVinculadoId: null });
    alterado = true;
  }

  return { alterado, cliente: findClienteById(clienteId) ?? atualizado };
}

export async function desvincularClienteVeiculoLocalAsync(
  clienteId: string,
  veiculoId: string,
): Promise<{ alterado: boolean; cliente: ClienteRegistro | null }> {
  if (await useRelationalStore()) {
    const db = await loadClientesDbAsync({ ids: [clienteId] });
    const cliente = db.clientes.find((c) => c.id === clienteId) ?? null;
    if (!cliente) return { alterado: false, cliente: null };

    const antes = cliente.rastreameVinculos ?? [];
    const vinculos = antes.filter((v) => v.veiculoId !== veiculoId);
    let alterado = vinculos.length !== antes.length;

    let atualizado = cliente;
    if (alterado) {
      atualizado = (await editarClienteAsync(clienteId, { rastreameVinculos: vinculos })) ?? cliente;
    }

    const veiculosDb = await loadVeiculosDbAsync({ veiculoId });
    const veiculo = veiculosDb.veiculos.find((v) => v.id === veiculoId) ?? null;
    if (veiculo?.clienteVinculadoId === clienteId) {
      await editarVeiculoAsync(veiculoId, { clienteVinculadoId: null });
      alterado = true;
    }

    const refreshedDb = await loadClientesDbAsync({ ids: [clienteId] });
    const refreshed = refreshedDb.clientes.find((c) => c.id === clienteId) ?? atualizado;
    return { alterado, cliente: refreshed };
  }
  return desvincularClienteVeiculoLocal(clienteId, veiculoId);
}
