import {
  calcularEncerramentoContratoAsync,
  formatarEncerramentoTexto,
  formatarEncerramentoWhatsApp,
  salvarRelatorioEncerramento,
  type EncerramentoInput,
  type EncerramentoResult,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";

export type GerarEncerramentoInput = EncerramentoInput & {
  salvar?: boolean;
  armazenarServidor?: boolean;
  outTxt?: string;
  outJson?: string;
  semJson?: boolean;
};

export async function gerarEncerramento(input: GerarEncerramentoInput) {
  if (!input.pastaContrato?.trim() && !input.contratoId?.trim()) {
    throw new HttpError(400, 'Informe "contratoId" ou "pastaContrato"');
  }
  if (!input.dataEncerramento?.trim()) {
    throw new HttpError(400, 'Campo "dataEncerramento" é obrigatório');
  }

  const pastaContrato = input.pastaContrato?.trim()
    ? input.pastaContrato.trim()
    : undefined;

  const encInput: EncerramentoInput = {
    pastaContrato,
    contratoId: input.contratoId?.trim() || undefined,
    dataEncerramento: input.dataEncerramento.trim(),
    semanasPagas: input.semanasPagas,
    infracoesPagasAuto: input.infracoesPagasAuto ?? input.multasPagasAuto,
    incluirTodasInfracoesPlaca:
      input.incluirTodasInfracoesPlaca ?? input.incluirTodasMultasPlaca,
    diasPrimeiroVencimento: input.diasPrimeiroVencimento,
    condutorId: input.condutorId,
    fonteDebitos: input.fonteDebitos ?? "abertos-db",
    incluirInfracoesCliente: input.incluirInfracoesCliente ?? true,
  };

  let result: EncerramentoResult;
  try {
    result = await calcularEncerramentoContratoAsync(encInput);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao calcular encerramento";
    throw new HttpError(400, msg);
  }

  const whatsapp = formatarEncerramentoWhatsApp(result);
  const texto = formatarEncerramentoTexto(result);

  let arquivos: { txt?: string; json?: string } | null = null;
  if (input.salvar !== false) {
    arquivos = salvarRelatorioEncerramento(result, whatsapp, {
      outTxt: input.outTxt,
      outJson: input.outJson,
      semJson: input.semJson,
    });
  }

  return {
    data: result,
    whatsapp,
    texto,
    avisos: result.avisos,
    arquivos,
  };
}
