import path from "node:path";

import {
  REPO_ROOT,
  ativarClienteDoContrato,
  atualizarContratoDbAsync,
  desativarClienteDoContrato,
  encerrarContratoDbAsync,
  encerrarContratoAtivoParaRenovarAsync,
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

  try {
    if ("placa" in input && input.placa && "semana" in input && input.semana != null) {
      dados = await montarDadosContratoFromDbAsync(input as MontarContratoDbInput);
    } else if ("veiculoId" in input && input.veiculoId && "semana" in input && input.semana != null) {
      dados = await montarDadosContratoFromDbAsync(input as MontarContratoDbInput);
    } else {
      dados = input as GerarContratoDados;
    }
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  normalizePaths(dados);

  const placa = dados.veiculo?.placa;
  const clienteNome = dados.cliente?.nome ?? "";
  const cpf = dados.cliente?.cpf ?? null;
  if (!placa) throw new HttpError(400, "Placa do veículo não informada");

  const clienteIdFiltro =
    "clienteId" in input && input.clienteId ? String(input.clienteId).trim() : undefined;
  const contratoRenovarId =
    "contratoRenovarId" in input && input.contratoRenovarId
      ? String(input.contratoRenovarId).trim()
      : undefined;

  const filtrosContrato = {
    placa,
    cpf,
    clienteNome,
    clienteId: clienteIdFiltro,
    contratoRenovarId,
  };

  let contratoEncerrado = null;
  if (modo === "renovar") {
    try {
      contratoEncerrado = await encerrarContratoAtivoParaRenovarAsync(
        filtrosContrato,
        dados.prazo.inicio,
      );
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  }

  let proximaVersao: number;
  let contratoAnteriorId: string | null | undefined;
  try {
    ({ proximaVersao, contratoAnteriorId } = await validarModoContratoAsync(modo, filtrosContrato));
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  const gerado = gerar(dados);
  let reg = null;
  try {
    reg = await registrarContratoAsync(gerado.pasta, {
      ...(contratoAnteriorId
        ? { contratoAnteriorId, versao: proximaVersao }
        : proximaVersao > 1
          ? { versao: proximaVersao }
          : {}),
    });
  } catch (err) {
    throw new HttpError(500, err instanceof Error ? err.message : String(err));
  }

  let clienteStatus = null;
  if (modo === "criar" && reg) {
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
    contratoEncerrado,
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
