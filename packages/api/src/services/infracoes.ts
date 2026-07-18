import {
  reconciliarCondutores,
  confirmarDebitoParceiroInfracao,
  compactPlaca,
  findInfracaoByNumeroAuto,
  loadInfracoesDb,
  loadInfracoesDbAsync,
  loadVeiculosDb,
  loadVeiculosDbAsync,
  placasIguais,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
  type VeiculoRegistro,
} from "../lib-imports.js";
import { listarVinculos, listarVinculosAsync } from "./parceiros.js";
import { HttpError } from "../http.js";

export type ListarInfracoesOpts = {
  placa?: string;
  veiculoId?: string;
  clienteId?: string;
  parceiroId?: string;
  emAberto?: boolean;
  semCliente?: boolean;
  /** @deprecated use semCliente */
  semCondutor?: boolean;
  ativo?: boolean;
};

type VeiculoRef = Pick<VeiculoRegistro, "id" | "placa">;

function infracaoEmAberto(i: InfracaoRegistro): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

/** Em infracoes.json, `veiculoId` guarda a placa (DETRAN), não o uuid do veículo. */
function infracaoPertenceVeiculo(infracao: InfracaoRegistro, veiculo: VeiculoRef): boolean {
  if (infracao.veiculoId === veiculo.id) return true;
  return placasIguais(infracao.veiculoId, veiculo.placa);
}

function resolveVeiculoRef(idOuPlaca: string, veiculos: VeiculoRef[]): VeiculoRef | null {
  const ref = idOuPlaca.trim();
  return (
    veiculos.find((v) => v.id === ref) ??
    veiculos.find((v) => placasIguais(v.placa, ref)) ??
    null
  );
}

function filtrarInfracoesPorVeiculoRef(
  items: InfracaoRegistro[],
  idOuPlaca: string,
  veiculos: VeiculoRef[],
): InfracaoRegistro[] {
  const veiculo = resolveVeiculoRef(idOuPlaca, veiculos);
  if (veiculo) {
    return items.filter((i) => infracaoPertenceVeiculo(i, veiculo));
  }
  const ref = idOuPlaca.trim();
  return items.filter((i) => i.veiculoId === ref || placasIguais(i.veiculoId, ref));
}

function aplicarFiltrosInfracoes(
  items: InfracaoRegistro[],
  opts: ListarInfracoesOpts,
  veiculos: VeiculoRef[],
  vinculosParceiro: Array<{ veiculoId: string }>,
): InfracaoRegistro[] {
  let out = items;

  if (opts.veiculoId?.trim()) {
    out = filtrarInfracoesPorVeiculoRef(out, opts.veiculoId, veiculos);
  } else if (opts.placa?.trim()) {
    out = filtrarInfracoesPorVeiculoRef(out, opts.placa, veiculos);
  }

  if (opts.ativo === true) {
    out = out.filter((i) => i.ativo !== false);
  } else if (opts.ativo === false) {
    out = out.filter((i) => i.ativo === false);
  }

  if (opts.emAberto === true) {
    out = out.filter(infracaoEmAberto);
  } else if (opts.emAberto === false) {
    out = out.filter((i) => !infracaoEmAberto(i));
  }

  const semCliente = opts.semCliente === true || opts.semCondutor === true;
  if (semCliente) {
    out = out.filter(
      (i) => !i.condutorId && !i.debitoParceiroConfirmado && !i.condutorNaoIdentificado,
    );
  }

  if (opts.clienteId?.trim()) {
    const id = opts.clienteId.trim();
    out = out.filter((i) => i.condutorId === id);
  }

  if (opts.parceiroId?.trim()) {
    const pid = opts.parceiroId.trim();
    const veiculoIds = new Set(vinculosParceiro.map((v) => v.veiculoId));
    const placaKeys = new Set<string>();
    for (const vid of veiculoIds) {
      placaKeys.add(compactPlaca(vid));
      const veiculo = resolveVeiculoRef(vid, veiculos);
      if (veiculo) placaKeys.add(compactPlaca(veiculo.placa));
    }
    out = out.filter(
      (i) =>
        i.debitoParceiroId === pid ||
        veiculoIds.has(i.veiculoId) ||
        placaKeys.has(compactPlaca(i.veiculoId)),
    );
  }

  return out;
}

function precisaCatalogoVeiculos(opts: ListarInfracoesOpts): boolean {
  return Boolean(opts.veiculoId?.trim() || opts.placa?.trim() || opts.parceiroId?.trim());
}

export function listarInfracoes(opts: ListarInfracoesOpts = {}): {
  total: number;
  items: InfracaoRegistro[];
} {
  const veiculos = precisaCatalogoVeiculos(opts) ? loadVeiculosDb().veiculos : [];
  const vinculos = opts.parceiroId?.trim()
    ? listarVinculos({ parceiroId: opts.parceiroId.trim() }).items
    : [];
  const items = aplicarFiltrosInfracoes(loadInfracoesDb().infracoes, opts, veiculos, vinculos);
  return { total: items.length, items };
}

export async function listarInfracoesAsync(opts: ListarInfracoesOpts = {}): Promise<{
  total: number;
  items: InfracaoRegistro[];
}> {
  const needsVeiculos = precisaCatalogoVeiculos(opts);
  const parceiroId = opts.parceiroId?.trim();

  const [infracoesDb, veiculosDb, vinculos] = await Promise.all([
    loadInfracoesDbAsync(),
    needsVeiculos ? loadVeiculosDbAsync() : Promise.resolve({ veiculos: [] as VeiculoRegistro[] }),
    parceiroId
      ? listarVinculosAsync({ parceiroId })
      : Promise.resolve({ total: 0, items: [] as Array<{ veiculoId: string }> }),
  ]);

  const items = aplicarFiltrosInfracoes(
    infracoesDb.infracoes,
    opts,
    veiculosDb.veiculos,
    vinculos.items,
  );
  return { total: items.length, items };
}

export function obterInfracao(numeroAuto: string): InfracaoRegistro | null {
  return findInfracaoByNumeroAuto(numeroAuto);
}

export function confirmarParceiroInfracao(numeroAuto: string, parceiroId?: string | null) {
  const item = confirmarDebitoParceiroInfracao(numeroAuto, parceiroId);
  if (!item) throw new HttpError(404, "Infração não encontrada");
  return item;
}

export function vincularDespesaInfracao(numeroAuto: string, clienteDespesaId: string) {
  const item = vincularClienteDespesaInfracao(numeroAuto, clienteDespesaId);
  if (!item) throw new HttpError(404, "Infração não encontrada");
  return item;
}

export async function atribuirClientesInfracoes(opts: {
  dryRun?: boolean;
  placa?: string;
  prazoDias?: number;
  incluirPedagios?: boolean;
}) {
  return reconciliarCondutores(opts);
}

/** @deprecated use atribuirClientesInfracoes */
export const atribuirCondutoresInfracoes = atribuirClientesInfracoes;

export async function infracoesPorVeiculoAsync(veiculoId: string) {
  const db = await loadVeiculosDbAsync();
  const veiculo = resolveVeiculoRef(veiculoId, db.veiculos);
  if (!veiculo) throw new HttpError(404, "Veículo não encontrado");
  return listarInfracoesAsync({ veiculoId: veiculo.id });
}
