import {
  findVeiculoByPlaca,
  montarPlanoBaixa,
  type LinhaPlanoBaixa,
  type MontarPlanoBaixaInput,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import * as despesasService from "./despesas.js";

export function montarPlano(input: MontarPlanoBaixaInput) {
  if (!input.clienteQuery?.trim()) {
    throw new HttpError(400, 'Campo "clienteQuery" é obrigatório');
  }
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    throw new HttpError(400, 'Campo "valor" inválido');
  }
  if (!input.dataBr?.trim()) {
    throw new HttpError(400, 'Campo "dataBr" é obrigatório');
  }

  try {
    return montarPlanoBaixa(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao montar plano de baixa";
    throw new HttpError(400, msg);
  }
}

export type ExecutarBaixaInput = {
  linhas: LinhaPlanoBaixa[];
  syncRastreame?: boolean;
};

export type ExecutarBaixaResultado = {
  aplicadas: number;
  resultados: Array<{
    num: number;
    operacao: string;
    autoInfracao: string | null;
    data?: unknown;
    proximaParcela?: unknown;
    aviso?: string | null;
    duplicado?: boolean;
  }>;
};

function resolveVeiculoIdDaLinha(linha: LinhaPlanoBaixa): string {
  const v = findVeiculoByPlaca(linha.rastreavel);
  if (v?.placa) return v.placa;
  throw new HttpError(
    400,
    `Veículo não encontrado para a linha ${linha.num}: ${linha.rastreavel}`,
  );
}

export async function executarBaixa(input: ExecutarBaixaInput): Promise<ExecutarBaixaResultado> {
  if (!Array.isArray(input.linhas) || input.linhas.length === 0) {
    throw new HttpError(400, 'Campo "linhas" é obrigatório e não pode ser vazio');
  }

  const syncOpts = { syncRastreame: input.syncRastreame !== false };
  const resultados: ExecutarBaixaResultado["resultados"] = [];

  for (const linha of input.linhas) {
    if (!linha.patch) {
      throw new HttpError(400, `Linha ${linha.num} sem campo "patch"`);
    }

    if (linha.operacao === "atualizar") {
      const alvo = linha.autoInfracao;
      if (!alvo) {
        throw new HttpError(400, `Linha ${linha.num}: operação atualizar exige autoInfracao`);
      }
      const r = await despesasService.atualizarDespesa(alvo, linha.patch, syncOpts);
      resultados.push({
        num: linha.num,
        operacao: linha.operacao,
        autoInfracao: alvo,
        data: r.data,
        proximaParcela: r.proximaParcela,
      });
      continue;
    }

    if (linha.operacao === "criar") {
      const veiculoId = resolveVeiculoIdDaLinha(linha);
      const item = despesasService.patchParaInput(linha.patch);
      const r = await despesasService.criarDespesa(veiculoId, item, syncOpts);
      resultados.push({
        num: linha.num,
        operacao: linha.operacao,
        autoInfracao: r.data.autoInfracao,
        data: r.data,
        proximaParcela: r.proximaParcela,
        aviso: r.aviso,
        duplicado: r.duplicado,
      });
      continue;
    }

    throw new HttpError(400, `Linha ${linha.num}: operação inválida`);
  }

  return { aplicadas: resultados.length, resultados };
}
