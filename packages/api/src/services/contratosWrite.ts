import path from "node:path";

import {
  REPO_ROOT,
  ativarClienteDoContrato,
  desativarClienteDoContrato,
  encerrarContratoDbAsync,
  excluirContrato,
  gerar,
  montarDadosContratoFromDb,
  registrarContrato,
  validarModoContrato,
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
    dados = montarDadosContratoFromDb(input as MontarContratoDbInput);
  } else {
    dados = input as GerarContratoDados;
  }
  normalizePaths(dados);

  const placa = dados.veiculo?.placa;
  const clienteNome = dados.cliente?.nome ?? "";
  const cpf = dados.cliente?.cpf ?? null;
  if (!placa) throw new HttpError(400, "Placa do veículo não informada");

  const { proximaVersao } = validarModoContrato(modo, { placa, cpf, clienteNome });
  const gerado = gerar(dados);
  let reg = null;
  try {
    reg = registrarContrato(gerado.pasta);
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

  return {
    modo,
    proximaVersao,
    pasta: gerado.pasta,
    docx: gerado.docx,
    pdf: gerado.pdf,
    contrato: reg,
    clienteStatus,
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

export function removerContrato(idOuPasta: string) {
  try {
    return excluirContrato(idOuPasta);
  } catch (err) {
    throw new HttpError(404, err instanceof Error ? err.message : String(err));
  }
}
