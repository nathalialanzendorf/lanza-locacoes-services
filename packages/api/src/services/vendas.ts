import {
  excluirVendaAsync,
  gravarVendaAsync,
  listarVendasAsync,
  obterVendaAsync,
  type ListarVendasOpts,
  type VendaInput,
  type VendaRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

export async function listarVendas(opts: ListarVendasOpts = {}): Promise<{
  total: number;
  items: VendaRegistro[];
}> {
  const items = await listarVendasAsync(opts);
  return { total: items.length, items };
}

export async function obterVenda(id: string): Promise<VendaRegistro | null> {
  return obterVendaAsync(id);
}

export async function criarVenda(input: VendaInput): Promise<VendaRegistro> {
  try {
    return await gravarVendaAsync(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao gravar venda";
    throw new HttpError(400, msg);
  }
}

export async function atualizarVenda(id: string, patch: Partial<VendaInput>): Promise<VendaRegistro> {
  const atual = await obterVendaAsync(id);
  if (!atual) throw new HttpError(404, "Venda não encontrada");
  try {
    return await gravarVendaAsync({
      id,
      veiculoId: patch.veiculoId !== undefined ? patch.veiculoId : atual.veiculoId,
      placa: patch.placa ?? atual.placa,
      clienteId: patch.clienteId !== undefined ? patch.clienteId : atual.clienteId,
      compradorNome: patch.compradorNome !== undefined ? patch.compradorNome : atual.compradorNome,
      dataVenda: patch.dataVenda ?? atual.dataVenda,
      valorVenda: patch.valorVenda !== undefined ? patch.valorVenda : atual.valorVenda,
      valorEntrada: patch.valorEntrada !== undefined ? patch.valorEntrada : atual.valorEntrada,
      dataPagamentoParcelas:
        patch.dataPagamentoParcelas !== undefined
          ? patch.dataPagamentoParcelas
          : atual.dataPagamentoParcelas,
      valorParcela: patch.valorParcela !== undefined ? patch.valorParcela : atual.valorParcela,
      quantidadeParcelas:
        patch.quantidadeParcelas !== undefined
          ? patch.quantidadeParcelas
          : atual.quantidadeParcelas,
      formaPagamento: patch.formaPagamento !== undefined ? patch.formaPagamento : atual.formaPagamento,
      observacao: patch.observacao !== undefined ? patch.observacao : atual.observacao,
      ativo: patch.ativo !== undefined ? patch.ativo : atual.ativo,
      veiculoVendido: patch.veiculoVendido,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar venda";
    throw new HttpError(400, msg);
  }
}

export async function removerVenda(id: string): Promise<VendaRegistro> {
  const item = await excluirVendaAsync(id);
  if (!item) throw new HttpError(404, "Venda não encontrada");
  return item;
}
