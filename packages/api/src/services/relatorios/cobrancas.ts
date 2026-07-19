import fs from "node:fs";
import path from "node:path";

import {
  COBRANCAS_OUT_DIR,
  TIPOS_COBRANCA_ACTION,
  ROTULO_TIPO_COBRANCA,
  compararDataBrAsc,
  dataVencimentoSemanalBr,
  ehRelatorioInfracoesGlobal,
  executarLoteCobranca,
  filtrarVencimentosCalculoSemanal,
  gerarCobrancaCanvasDeSidecar,
  gerarEstacionamento,
  gerarMultas,
  gerarSemanal,
  loadCobrancasDbContextAsync,
  salvarCobranca,
  salvarCobrancasDados,
  jurosMultaDiario,
  listarResumoAlvos,
  loadClienteDespesasDb,
  loadContratosDb,
  montarCobrancaSidecar,
  montarPacoteCobrancaSemanalAtraso,
  normalizarTipoCobrancaAction,
  resolverCliente,
  resolverModoCanvasCobranca,
  salvarCobrancaSimplesSidecar,
  salvarCobrancasSidecar,
  salvarLoteConsolidado,
  salvarRelatorioInfracoesSidecars,
  type FiltroAlvosCobranca,
  type LoteCobrancaItem,
  type LoteCobrancaResult,
  type TipoCobrancaAction,
  type VarianteCanvasInfracoes,
} from "../../lib-imports.js";
import { HttpError } from "../../http.js";
import { hojeBr, resolverFiltroRelatorio, resolverFiltroRelatorioAsync, type FiltroRelatorioInput } from "./filtro.js";

export function metaCobrancas() {
  return {
    tipos: TIPOS_COBRANCA_ACTION.map((id) => ({
      id,
      rotulo: ROTULO_TIPO_COBRANCA[id],
    })),
    modosPlaca: ["semanal", "estacionamento", "multa", "semanal-atraso"],
    outDirPadrao: COBRANCAS_OUT_DIR,
  };
}

export async function listarAlvos(
  tipo: string,
  filtroInput: FiltroRelatorioInput = {},
): Promise<{ tipo: TipoCobrancaAction; total: number; items: ReturnType<typeof listarResumoAlvos> }> {
  const t = normalizarTipoCobrancaAction(tipo);
  if (!t) {
    throw new HttpError(400, `Tipo de cobrança inválido: ${tipo}`);
  }
  const ctx = await loadCobrancasDbContextAsync();
  const filtro = await resolverFiltroRelatorioAsync(filtroInput, ctx);
  const items = listarResumoAlvos(t, filtro, ctx);
  return { tipo: t, total: items.length, items };
}

export type GerarCobrancasInput = {
  tipos?: string[];
  filtro?: FiltroRelatorioInput;
  diaOverride?: number;
  dataPagamentoBr?: string;
  salvar?: boolean;
  armazenarServidor?: boolean;
  outDir?: string;
  canvasInfracoes?: VarianteCanvasInfracoes;
  gerarCanvas?: boolean;
};

function resolverTipos(raw?: string[]): TipoCobrancaAction[] {
  if (!raw?.length) return [...TIPOS_COBRANCA_ACTION];
  const tipos: TipoCobrancaAction[] = [];
  for (const item of raw) {
    const t = normalizarTipoCobrancaAction(item);
    if (!t) {
      throw new HttpError(400, `Tipo de cobrança inválido: ${item}`);
    }
    tipos.push(t);
  }
  return tipos;
}

function itemsDoEscopo(
  results: LoteCobrancaResult[],
  filtro: FiltroAlvosCobranca,
): LoteCobrancaItem[] {
  const items: LoteCobrancaItem[] = [];
  for (const result of results) {
    for (const item of result.items) {
      if (filtro.placa && item.alvo.placa !== filtro.placa) continue;
      if (filtro.clienteId && item.alvo.clienteId !== filtro.clienteId) continue;
      items.push(item);
    }
  }
  return items;
}

export async function gerarCobrancas(input: GerarCobrancasInput = {}) {
  const tipos = resolverTipos(input.tipos);
  const ctx = await loadCobrancasDbContextAsync();
  const filtro = await resolverFiltroRelatorioAsync(input.filtro, ctx);
  const salvar = input.salvar !== false;
  const outDir = input.outDir ?? COBRANCAS_OUT_DIR;
  const dataRef = input.dataPagamentoBr ?? hojeBr();

  if (
    tipos.includes("pagamento-semanal") &&
    input.diaOverride != null &&
    ![1, 2, 3, 4].includes(input.diaOverride)
  ) {
    throw new HttpError(400, "diaOverride deve ser 1, 2, 3 ou 4");
  }

  const lotes: LoteCobrancaResult[] = [];
  let totalAlvos = 0;
  let totalMensagens = 0;
  let totalIgnorados = 0;
  const arquivosLote: string[] = [];

  for (const tipo of tipos) {
    const result = executarLoteCobranca(tipo, {
      filtro,
      diaOverride: input.diaOverride,
      dataPagamentoBr: dataRef,
      salvar,
      outDir,
      ctx,
    });
    lotes.push(result);
    totalAlvos += result.resumo.alvos;
    totalMensagens += result.resumo.mensagens;
    totalIgnorados += result.resumo.ignorados;
    if (salvar && result.items.length) {
      arquivosLote.push(salvarLoteConsolidado(result, outDir));
    }
  }

  const escopoUnico = filtro.clienteId != null || filtro.placa != null;
  const itemsEscopo = escopoUnico ? itemsDoEscopo(lotes, filtro) : [];
  const sidecar = escopoUnico
    ? montarCobrancaSidecar(filtro, itemsEscopo, dataRef, tipos)
    : null;

  const arquivosSidecar: string[] = [];
  const arquivosCanvas: string[] = [];

  if (salvar) {
    const modoCanvas = resolverModoCanvasCobranca(tipos, filtro);
    const variante = input.canvasInfracoes ?? "completo";
    const sidecars = ehRelatorioInfracoesGlobal(tipos, filtro)
      ? salvarRelatorioInfracoesSidecars(lotes, dataRef, { outDir, variante })
      : modoCanvas === "simples-tipo" || modoCanvas === "simples-placa"
        ? salvarCobrancaSimplesSidecar(lotes, dataRef, {
            outDir,
            filtro,
            tiposSolicitados: tipos,
            modo: modoCanvas,
          })
        : salvarCobrancasSidecar(lotes, dataRef, {
            outDir,
            filtro,
            tiposSolicitados: tipos,
          });
    arquivosSidecar.push(...sidecars);

    if (input.gerarCanvas) {
      for (const p of [...new Set(sidecars.filter((f) => f.endsWith(".json")))]) {
        try {
          const { repoPath, cursorPath } = gerarCobrancaCanvasDeSidecar(p);
          arquivosCanvas.push(repoPath);
          if (cursorPath) arquivosCanvas.push(cursorPath);
        } catch {
          /* canvas opcional */
        }
      }
    }
  }

  return {
    tipos,
    filtro,
    dataReferencia: dataRef,
    resumo: {
      alvos: totalAlvos,
      mensagens: totalMensagens,
      ignorados: totalIgnorados,
    },
    lotes,
    sidecar,
    arquivos: {
      loteConsolidado: arquivosLote,
      sidecars: arquivosSidecar,
      canvas: arquivosCanvas,
    },
  };
}

export type GerarCobrancaPlacaInput = {
  modo: "semanal" | "estacionamento" | "multa";
  placa: string;
  dia?: number;
  auto?: string;
  nome?: string;
  salvar?: boolean;
  outDir?: string;
};

export function gerarCobrancaPlaca(input: GerarCobrancaPlacaInput) {
  const placa = input.placa?.trim();
  if (!placa) throw new HttpError(400, 'Campo "placa" é obrigatório');

  const salvar = input.salvar !== false;
  const outDir = input.outDir ?? COBRANCAS_OUT_DIR;
  let resultados;

  switch (input.modo) {
    case "semanal": {
      const dia = input.dia ?? 1;
      if (![1, 2, 3, 4].includes(dia)) {
        throw new HttpError(400, "dia deve ser 1, 2, 3 ou 4");
      }
      resultados = [gerarSemanal(placa, dia, { nome: input.nome })];
      break;
    }
    case "estacionamento":
      resultados = [gerarEstacionamento(placa, { nome: input.nome })];
      break;
    case "multa": {
      resultados = gerarMultas(placa, { auto: input.auto, nome: input.nome });
      if (resultados.length === 0) {
        throw new HttpError(404, `Nenhuma infração em aberto para ${placa}`);
      }
      break;
    }
    default:
      throw new HttpError(400, `Modo inválido: ${input.modo}`);
  }

  const arquivos: string[] = [];
  if (salvar) {
    for (const r of resultados) {
      arquivos.push(salvarCobranca(r, outDir));
    }
    arquivos.push(salvarCobrancasDados(resultados, input.modo, placa, outDir));
  }

  return { placa, modo: input.modo, resultados, arquivos };
}

export type SemanalAtrasoInput = {
  clienteQuery?: string;
  placa?: string;
  dataPagamentoBr?: string;
  vencimentos?: string[];
  valorSemanal?: number;
  valorDiaria?: number;
  salvar?: boolean;
  outDir?: string;
};

function normPlaca(p: string): string {
  return p.replace(/\W/g, "").toUpperCase();
}

function contratoAtivoPlaca(placa: string) {
  const p = normPlaca(placa);
  const list = loadContratosDb().contratos.filter(
    (c) => c.status === "ativo" && normPlaca(c.placa ?? "") === p,
  );
  list.sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0));
  return list[0] ?? null;
}

function vencimentosAbertosCliente(clienteId: string, placa?: string): string[] {
  const db = loadClienteDespesasDb();
  const out = new Set<string>();
  for (const d of db.clienteDespesas) {
    if (d.ativo === false || d.paga === true) continue;
    if (d.categoria !== "Locação semanal" || !/ATRASADO/i.test(d.descricao)) continue;
    if (d.condutorId !== clienteId) continue;
    if (placa && normPlaca(d.veiculoId) !== normPlaca(placa)) continue;
    const v = dataVencimentoSemanalBr(d.descricao, d.rastreameDataIso) ?? d.dataAutuacao;
    if (v) out.add(v);
  }
  return [...out].sort(compararDataBrAsc);
}

export function gerarSemanalAtraso(input: SemanalAtrasoInput) {
  const dataPagamentoBr = input.dataPagamentoBr ?? hojeBr();
  let cliente = input.clienteQuery ? resolverCliente(input.clienteQuery) : null;
  const placa = input.placa?.trim();

  if (!cliente && placa) {
    const c = contratoAtivoPlaca(placa);
    if (c?.clienteId) {
      cliente = resolverCliente(c.clienteId);
    }
  }

  if (!cliente?.id) {
    throw new HttpError(400, "Informe clienteQuery ou placa com contrato ativo");
  }

  let valorSemanal = input.valorSemanal;
  let valorDiaria = input.valorDiaria;
  if (placa) {
    const c = contratoAtivoPlaca(placa);
    valorSemanal ??= c?.valorSemanal ?? undefined;
    valorDiaria ??= c?.valorDiaria ?? undefined;
  }

  let vencimentos = input.vencimentos?.map((v) => v.trim()).filter(Boolean) ?? [];
  if (vencimentos.length === 0) {
    vencimentos = vencimentosAbertosCliente(cliente.id, placa);
  }
  if (vencimentos.length === 0) {
    throw new HttpError(404, "Nenhum vencimento em aberto encontrado");
  }

  if (valorSemanal == null || valorDiaria == null) {
    throw new HttpError(400, "valorSemanal e valorDiaria não encontrados — informe no corpo");
  }

  const vencElegiveis = filtrarVencimentosCalculoSemanal(vencimentos, dataPagamentoBr, true);
  if (vencElegiveis.length === 0) {
    throw new HttpError(400, "Nenhum vencimento elegível para cálculo");
  }

  const pacote = montarPacoteCobrancaSemanalAtraso({
    valorSemanal,
    valorDiaria,
    vencimentosBr: vencElegiveis,
    dataPagamentoBr,
    emAberto: true,
    clienteNome: cliente.nome,
    placa: placa ?? undefined,
    clienteId: cliente.id,
  });

  if (!pacote) {
    throw new HttpError(400, "Não foi possível montar tabela de juros/multa");
  }

  const data = {
    ...pacote.payload,
    cliente: { id: cliente.id, nome: cliente.nome, cpf: cliente.cpf ?? null },
    jurosMultaDiario: jurosMultaDiario(valorSemanal, valorDiaria),
    markdown: pacote.markdown,
    totalGeral: pacote.totalGeral,
    resumo: pacote.resumo,
  };

  const arquivos: string[] = [];
  if (input.salvar !== false) {
    const outDir = input.outDir ?? COBRANCAS_OUT_DIR;
    fs.mkdirSync(outDir, { recursive: true });
    const slug = (cliente.nome ?? "cliente")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w]+/g, "-")
      .toLowerCase()
      .slice(0, 40);
    const dataArq = dataPagamentoBr.replace(/\//g, "-");
    const mdPath = path.join(outDir, `semanal-atraso-${slug}-${dataArq}.md`);
    const jsonPath = path.join(outDir, `dados-semanal-atraso-${slug}-${dataArq}.json`);
    fs.writeFileSync(mdPath, pacote.markdown, "utf8");
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
    arquivos.push(mdPath, jsonPath);
  }

  return { data, arquivos };
}
