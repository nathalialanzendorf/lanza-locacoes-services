import path from "node:path";

import {
  REPO_ROOT,
  ativarClienteDoContrato,
  atualizarContratoDbAsync,
  desativarClienteDoContrato,
  encerrarContratoDbAsync,
  excluirContratoAsync,
  gerar,
  gerarDespesasIniciaisContratoAsync,
  montarDadosContratoFromDbAsync,
  registrarContratoAsync,
  validarModoContratoAsync,
  type GerarContratoDados,
  type MontarContratoDbInput,
  type MotivoEncerramento,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

function absRepo(p: string | undefined): string | undefined {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

function normalizePaths(dados: GerarContratoDados): void {
  for (const k of ["template", "contratosDir", "cnhArquivo"] as const) {
    if (dados[k]) {
      (dados as unknown as Record<string, string | undefined>)[k] = absRepo(dados[k] as string);
    }
  }
  if (process.env.VERCEL) {
    dados.contratosDir = path.join("/tmp", "lanza-contratos");
  }
}

export type ContratoCriarRenovarInput = GerarContratoDados | MontarContratoDbInput;

export async function criarContrato(input: ContratoCriarRenovarInput) {
  return executarContratoModo("criar", input);
}

export async function renovarContrato(input: ContratoCriarRenovarInput) {
  return executarContratoModo("renovar", input);
}

async function executarContratoModo(
  modo: "criar" | "renovar",
  input: ContratoCriarRenovarInput,
) {
  let dados: GerarContratoDados;

  if ("placa" in input && input.placa && "semana" in input && input.semana != null) {
    dados = await montarDadosContratoFromDbAsync(input as MontarContratoDbInput);
  } else if ("veiculoId" in input && input.veiculoId && "semana" in input && input.semana != null) {
    dados = await montarDadosContratoFromDbAsync(input as MontarContratoDbInput);
  } else {
    dados = input as GerarContratoDados;
  }
  normalizePaths(dados);

  const placa = dados.veiculo?.placa;
  const clienteNome = dados.cliente?.nome ?? "";
  const cpf = dados.cliente?.cpf ?? null;
  if (!placa) throw new HttpError(400, "Placa do veículo não informada");

  const { proximaVersao } = await validarModoContratoAsync(modo, { placa, cpf, clienteNome });
  const gerado = gerar(dados);
  let reg = null;
  try {
    reg = await registrarContratoAsync(gerado.pasta);
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : String(err));
  }

  let clienteStatus = null;
  if (reg) {
    clienteStatus = await ativarClienteDoContrato({
      clienteId: reg.clienteId,
      cpf: reg.cpf,
      nome: reg.clienteNome,
      placa: reg.placa,
      veiculoId: reg.veiculoId,
    });
  }

  let despesasIniciais = null;
  if (modo === "criar" && reg) {
    const montarInput =
      "placa" in input && input.placa && "semana" in input && input.semana != null
        ? (input as MontarContratoDbInput)
        : "veiculoId" in input && input.veiculoId && "semana" in input && input.semana != null
          ? (input as MontarContratoDbInput)
          : null;
    try {
      despesasIniciais = await gerarDespesasIniciaisContratoAsync(reg, dados, montarInput);
    } catch (err) {
      throw new HttpError(
        500,
        `Contrato criado, mas falha ao gerar despesas iniciais: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    modo,
    proximaVersao,
    pasta: gerado.pasta,
    docx: gerado.docx,
    pdf: gerado.pdf,
    contrato: reg,
    clienteStatus,
    despesasIniciais,
  };
}

export type ContratoEncerrarInput = {
  idOuPasta: string;
  dataEncerramento: string;
  motivoEncerramento: MotivoEncerramento;
  quebraContrato?: boolean;
};

export async function encerrarContrato(input: ContratoEncerrarInput) {
  const quebra =
    input.quebraContrato ?? (input.motivoEncerramento === "troca" ? false : true);
  const r = await encerrarContratoDbAsync(input.idOuPasta, {
    dataEncerramento: input.dataEncerramento,
    motivoEncerramento: input.motivoEncerramento,
    quebraContrato: quebra,
  });
  const clienteStatus = await desativarClienteDoContrato({
    clienteId: r.clienteId,
    cpf: r.cpf,
    nome: r.clienteNome,
    placa: r.placa,
    veiculoId: r.veiculoId,
    contratoId: r.id,
  });
  return { contrato: r, clienteStatus };
}

export async function removerContrato(idOuPasta: string) {
  try {
    return await excluirContratoAsync(idOuPasta);
  } catch (err) {
    throw new HttpError(404, err instanceof Error ? err.message : String(err));
  }
}

export type ContratoAtualizarInput = {
  dataFimPrevista?: string;
  prazoDias?: number;
  dataEncerramento?: string | null;
  motivoEncerramento?: MotivoEncerramento | null;
  quebraContrato?: boolean;
  status?: "ativo" | "encerrado";
  tipoContrato?: "semanal" | "diaria" | "mensal";
  diaPagamentoSemana?: string | null;
  diaPagamentoMes?: number | null;
  diaPagamentoTexto?: string | null;
};

export async function atualizarContrato(id: string, input: ContratoAtualizarInput) {
  try {
    const contrato = await atualizarContratoDbAsync(id, input);
    return { contrato };
  } catch (err) {
    throw new HttpError(404, err instanceof Error ? err.message : String(err));
  }
}
