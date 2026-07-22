import {
  montarPlanoBaixaAsync,
  withBaixaPlanoDbContext,
  scopeFromLinhasBaixa,
  resolvePlacaLinhaPlanoBaixa,
  resolveSyncRastreame,
  type LinhaPlanoBaixa,
  type MontarPlanoBaixaInput,
} from "../lib-imports.js";
import { HttpError } from "../http.js";
import * as despesasService from "./despesas.js";

export async function montarPlano(input: MontarPlanoBaixaInput) {
  if (!input.clienteId?.trim() && !input.clienteQuery?.trim()) {
    throw new HttpError(400, 'Informe "clienteId" ou "clienteQuery"');
  }
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    throw new HttpError(400, 'Campo "valor" inválido');
  }
  if (!input.dataBr?.trim()) {
    throw new HttpError(400, 'Campo "dataBr" é obrigatório');
  }

  try {
    return await montarPlanoBaixaAsync(input);
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
  try {
    return resolvePlacaLinhaPlanoBaixa(linha);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(400, msg);
  }
}

export async function executarBaixa(input: ExecutarBaixaInput): Promise<ExecutarBaixaResultado> {
  if (!Array.isArray(input.linhas) || input.linhas.length === 0) {
    throw new HttpError(400, 'Campo "linhas" é obrigatório e não pode ser vazio');
  }

  const syncOpts = {
    syncRastreame: resolveSyncRastreame(input.syncRastreame !== false ? undefined : false),
  };
  const resultados: ExecutarBaixaResultado["resultados"] = [];

  return withBaixaPlanoDbContext(
    async () => {
    for (const linha of input.linhas) {
      if (!linha.patch) {
        throw new HttpError(400, `Linha ${linha.num} sem campo "patch"`);
      }

      if (linha.operacao === "atualizar") {
        const alvo = linha.despesaId?.trim() || linha.autoInfracao;
        if (!alvo) {
          throw new HttpError(
            400,
            `Linha ${linha.num}: operação atualizar exige despesaId ou autoInfracao`,
          );
        }
        const r = await despesasService.atualizarDespesa(alvo, linha.patch, syncOpts);
        resultados.push({
          num: linha.num,
          operacao: linha.operacao,
          autoInfracao: r.data.autoInfracao ?? linha.autoInfracao,
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
  },
    scopeFromLinhasBaixa(input.linhas),
  );
}
