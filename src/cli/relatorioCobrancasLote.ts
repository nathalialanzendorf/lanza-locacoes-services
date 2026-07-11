/**
 * CLI: cobranças em lote por tipo (actions).
 */
import {
  executarLoteCobranca,
  listarResumoAlvos,
  salvarLoteConsolidado,
  type LoteCobrancaItem,
  type LoteCobrancaResult,
} from "../lib/cobrancasLote.js";
import { gerarCobrancaCanvasDeSidecar } from "../lib/gerarCobrancaCanvas.js";
import {
  ehRelatorioInfracoesGlobal,
  montarCobrancaSidecar,
  salvarCobrancasSidecar,
  salvarCobrancaSimplesSidecar,
  salvarRelatorioInfracoesSidecars,
  agruparMensagensWhatsAppPorTipo,
  type CobrancaRelatorioSidecar,
  type VarianteCanvasInfracoes,
} from "../lib/cobrancasRelatorioSidecar.js";
import {
  normalizarTipoCobrancaAction,
  resolverModoCanvasCobranca,
  TIPOS_COBRANCA_ACTION,
  listarEscoposContratosAtivosCobranca,
  type FiltroAlvosCobranca,
  type TipoCobrancaAction,
} from "../lib/cobrancasAlvos.js";
import { COBRANCAS_OUT_DIR } from "../lib/cobrancas.js";
import { loadClientesDb } from "../lib/clientesDb.js";
import {
  formatCobrancaSemanalAtrasoMarkdown,
  resolverDiaEscalonamentoSemanal,
  type ResumoCobrancaSemanal,
  type TabelaCobrancaSemanal,
} from "../lib/pagamentoSemanalCobranca.js";
import { resolverCliente } from "../lib/recebimento/baixaPlano.js";
import { compactPlaca } from "../lib/placa.js";

function getOpt(argv: string[], nome: string): string | undefined {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function listarTiposCobranca(): void {
  console.log(`Tipos de despesa em cobrança (omitir = todos):

  pagamento-semanal       Semanas ATRASADO em aberto (+ tabela dia a dia)
  renegociacao            Parcelas de renegociação em aberto
  infracoes               Infrações de trânsito em aberto
  pedagio                 Pedágio em aberto
  estacionamento-rotativo Estacionamento em aberto
  manutencao              Manutenção em aberto

Parâmetros opcionais (omitir = todos): --tipo · --cliente · --placa
`);
}

function rotuloTipos(tipos: TipoCobrancaAction[]): string {
  if (tipos.length === TIPOS_COBRANCA_ACTION.length) return "todos os tipos";
  if (tipos.length === 1) return tipos[0]!;
  return tipos.join(", ");
}

function resolverFiltro(argv: string[]): FiltroAlvosCobranca {
  const placa = getOpt(argv, "--placa");
  const clienteQuery = getOpt(argv, "--cliente");
  if (placa && clienteQuery) {
    console.error("Erro: use --placa OU --cliente, não ambos.");
    process.exit(1);
  }
  if (clienteQuery) {
    const c = resolverCliente(clienteQuery);
    if (!c.id) {
      console.error("Cliente sem id em clientes.json:", c.nome);
      process.exit(1);
    }
    return { clienteId: c.id };
  }
  if (placa) return { placa };
  return {};
}

function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

function rotuloDiaSemanal(vencimentosBr: string[] | undefined, refHoje: string): string {
  if (!vencimentosBr?.length) return "";
  const dia = resolverDiaEscalonamentoSemanal(vencimentosBr, refHoje);
  if (dia == null) return " · em prazo";
  const titulos = ["", "lembrete", "aviso", "bloqueio"];
  return ` · dia ${dia} (${titulos[dia] ?? "?"})`;
}

function rotuloFiltro(filtro: FiltroAlvosCobranca): string {
  const partes: string[] = [];
  if (filtro.placa) partes.push(`placa ${filtro.placa}`);
  else if (filtro.clienteId) {
    const c = loadClientesDb().clientes.find((x) => x.id === filtro.clienteId);
    partes.push(c?.nome ? `cliente ${c.nome}` : `cliente ${filtro.clienteId}`);
  } else {
    partes.push("todos os clientes/veículos");
  }
  return partes.join(" · ");
}

function uso(): void {
  console.log(`Uso: relatorio-cobrancas [tipo-despesa] [opções]

Tipos de despesa (omitir = todos):
  pagamento-semanal | renegociacao | infracoes | pedagio | estacionamento-rotativo | manutencao

Opções:
  --tipo TIPO           Filtra um tipo-despesa (ou passe como 1º argumento)
  --cliente NOME/CPF/id Filtra locatário (omitir = todos; exclusivo com --placa)
  --placa PLACA         Filtra veículo (omitir = todos; exclusivo com --cliente)
  --listar              Só lista alvos elegíveis (não gera mensagens)
  --dia N               (pagamento-semanal) força template 1–4 [padrão: auto D+1 lembrete · D+2 aviso · D+3 bloqueio]
  --data-pagamento DD/MM/AAAA  (pagamento-semanal) data p/ tabela de atraso [hoje]
  --canvas-infracoes completo|resumido|ambos  (só infracoes global) [completo]
  --no-salvar           Só imprime no terminal
  --out DIR             Diretório de saída [padrão relatorios/_tmp/cobrancas/]

Sem parâmetros: gera cobrança para todos os tipos, clientes e veículos elegíveis.
`);
}

/** null em tipo inválido; array vazio nunca — omitir tipo = todos. */
function resolverTipos(argv: string[]): TipoCobrancaAction[] | null {
  const fromFlag = getOpt(argv, "--tipo");
  if (fromFlag) {
    const t = normalizarTipoCobrancaAction(fromFlag);
    if (!t) {
      console.error(`Tipo-despesa inválido: ${fromFlag}`);
      return null;
    }
    return [t];
  }
  const first = argv.find((a) => !a.startsWith("-"));
  if (first) {
    const t = normalizarTipoCobrancaAction(first);
    if (t) return [t];
  }
  return [...TIPOS_COBRANCA_ACTION];
}

function argsPosicionais(argv: string[]): string[] {
  const skip = new Set<number>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("-") && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      skip.add(i + 1);
    }
  }
  return argv.filter((a, i) => !a.startsWith("-") && !skip.has(i));
}

function resolverVarianteCanvasInfracoes(
  argv: string[],
  tipos: TipoCobrancaAction[],
  filtro: FiltroAlvosCobranca,
): VarianteCanvasInfracoes {
  if (!ehRelatorioInfracoesGlobal(tipos, filtro)) return "completo";

  const fromFlag = getOpt(argv, "--canvas-infracoes");
  if (fromFlag) {
    const v = fromFlag.trim().toLowerCase();
    if (v === "completo" || v === "resumido" || v === "ambos") return v;
    console.error(
      `Erro: --canvas-infracoes inválido (${fromFlag}). Use completo, resumido ou ambos.`,
    );
    process.exit(1);
  }

  const segundo = argsPosicionais(argv)[1]?.trim().toLowerCase();
  if (segundo === "completo" || segundo === "resumido" || segundo === "ambos") return segundo;
  return "completo";
}

function imprimirListagem(tipo: TipoCobrancaAction, filtro: FiltroAlvosCobranca): void {
  const alvos = listarResumoAlvos(tipo, filtro);
  console.log(`\nAlvos elegíveis — ${tipo} (${rotuloFiltro(filtro)}): ${alvos.length}\n`);
  if (alvos.length === 0) {
    console.log("  (nenhum)");
    return;
  }
  for (const a of alvos) {
    const nome = a.clienteNome ?? "(sem cliente)";
    const qtd = a.despesas.length;
    const extra =
      tipo === "pagamento-semanal" && a.vencimentosBr?.length
        ? ` · venc.: ${a.vencimentosBr.join(", ")}${rotuloDiaSemanal(a.vencimentosBr, hojeBr())}`
        : tipo === "renegociacao" || tipo === "manutencao"
          ? ` · ${brl(a.despesas.reduce((s, d) => s + (Number(d.valorMulta) || 0), 0))}`
          : "";
    console.log(`  ${a.placa} · ${nome} · ${qtd} despesa(s)${extra}`);
  }
}

function imprimirCabecalhoContrato(sidecar: CobrancaRelatorioSidecar | null): void {
  if (!sidecar || sidecar.dataInicio === "—") return;
  console.log(
    `\nContrato: ${sidecar.placa} · ${sidecar.cliente} · ${sidecar.dataInicio} → ${sidecar.dataFim} (${sidecar.qtdDiasContrato} dias)`,
  );
  if (sidecar.linhaEncerramento) {
    console.log(sidecar.linhaEncerramento);
  }
}

function imprimirBlocoFinalRelatorio(
  items: LoteCobrancaItem[],
  opts?: {
    pagamentoSemanal?: Record<string, unknown> | null;
    resumoSemanal?: Record<string, unknown> | null;
    mensagensWhatsApp?: Array<{ tipo: string; placa: string; titulo: string; texto: string }>;
  },
): void {
  const semanalVistos = new Set<string>();
  const blocosSemanal: string[] = [];

  for (const item of items) {
    if (item.semanalAtraso) {
      const chave = `${item.alvo.placa}|${item.alvo.clienteId ?? ""}`;
      if (!semanalVistos.has(chave)) {
        semanalVistos.add(chave);
        blocosSemanal.push(item.semanalAtraso.markdown);
      }
    }
  }

  if (
    blocosSemanal.length === 0 &&
    opts?.pagamentoSemanal &&
    opts?.resumoSemanal
  ) {
    const p = opts.pagamentoSemanal;
    const input = {
      valorSemanal: Number(p.valorSemanal),
      valorDiaria: Number(p.valorDiaria),
      vencimentosBr: (p.vencimentosBr as string[]) ?? [],
      dataPagamentoBr: String(p.dataPagamentoBr ?? hojeBr()),
      clienteNome: String((p.cliente as { nome?: string } | undefined)?.nome ?? ""),
      placa: String(p.placa ?? ""),
    };
    blocosSemanal.push(
      formatCobrancaSemanalAtrasoMarkdown(
        input,
        {
          tabelas: (p.tabelas as TabelaCobrancaSemanal[]) ?? [],
          totalGeral: Number(p.totalGeral) || 0,
        },
        opts.resumoSemanal as ResumoCobrancaSemanal,
      ),
    );
  }

  const mensagens = opts?.mensagensWhatsApp ?? [];

  if (blocosSemanal.length === 0 && mensagens.length === 0) {
    return;
  }

  console.log("\n" + "═".repeat(48));
  if (blocosSemanal.length > 0) {
    console.log("\n## Cobrança semanal em atraso (diária)\n");
    for (const bloco of blocosSemanal) console.log(bloco + "\n");
  }
  if (mensagens.length > 0) {
    console.log("\n## Mensagens WhatsApp (enviar separadamente)\n");
    const grupos = agruparMensagensWhatsAppPorTipo(mensagens);
    for (const grupo of grupos) {
      console.log(`### ${grupo.rotulo}\n`);
      for (let i = 0; i < grupo.mensagens.length; i++) {
        const m = grupo.mensagens[i]!;
        const prefixo =
          grupo.mensagens.length > 1 ? `${i + 1}. ` : "";
        console.log(`── ${prefixo}${m.titulo.replace(/\r/g, "").trim()} ──\n`);
        console.log(m.texto + "\n");
      }
    }
  }
}

function itemsDoEscopo(
  results: LoteCobrancaResult[],
  filtro: FiltroAlvosCobranca,
): LoteCobrancaItem[] {
  const items: LoteCobrancaItem[] = [];
  for (const result of results) {
    for (const item of result.items) {
      if (filtro.placa && compactPlaca(item.alvo.placa) !== compactPlaca(filtro.placa)) continue;
      if (filtro.clienteId && item.alvo.clienteId !== filtro.clienteId) continue;
      items.push(item);
    }
  }
  return items;
}

export function mainLote(argv: string[]): void {
  if (argv.includes("-h") || argv.includes("--help")) {
    uso();
    process.exit(0);
  }

  const tipos = resolverTipos(argv);
  if (!tipos) {
    uso();
    process.exit(1);
  }

  const filtro = resolverFiltro(argv);
  const apenasListar = argv.includes("--listar");
  const salvar = !argv.includes("--no-salvar");
  const outDir = getOpt(argv, "--out") ?? COBRANCAS_OUT_DIR;
  const diaRaw = getOpt(argv, "--dia");
  const diaOverride = diaRaw != null ? Number(diaRaw) : undefined;
  const dataPagamento = getOpt(argv, "--data-pagamento");

  if (
    tipos.includes("pagamento-semanal") &&
    diaOverride != null &&
    ![1, 2, 3, 4].includes(diaOverride)
  ) {
    console.error("Erro: --dia deve ser 1, 2, 3 ou 4.");
    process.exit(1);
  }

  const cabecalho = `${rotuloTipos(tipos)} · ${rotuloFiltro(filtro)}`;
  console.log(`\n=== Cobrança: ${cabecalho} ===`);

  if (apenasListar) {
    if (!filtro.placa && !filtro.clienteId) {
      const contratos = listarEscoposContratosAtivosCobranca();
      const clientesUnicos = new Map<string, string[]>();
      for (const e of contratos) {
        if (!e.clienteId) continue;
        const placas = clientesUnicos.get(e.clienteId) ?? [];
        if (e.placa) placas.push(e.placa);
        clientesUnicos.set(e.clienteId, placas);
      }
      console.log(
        `\nClientes com contrato ativo: ${clientesUnicos.size} (${contratos.length} veículo(s))\n`,
      );
      for (const [clienteId, placas] of [...clientesUnicos.entries()].sort((a, b) => {
        const nomeA = loadClientesDb().clientes.find((x) => x.id === a[0])?.nome ?? "";
        const nomeB = loadClientesDb().clientes.find((x) => x.id === b[0])?.nome ?? "";
        return nomeA.localeCompare(nomeB, "pt-BR");
      })) {
        const c = loadClientesDb().clientes.find((x) => x.id === clienteId);
        const nome = c?.nome ?? clienteId;
        console.log(`  ${nome} · ${placas.join(", ")}`);
      }
    }
    for (const tipo of tipos) {
      imprimirListagem(tipo, filtro);
    }
    process.exit(0);
  }

  let totalAlvos = 0;
  let totalMensagens = 0;
  let totalIgnorados = 0;
  const resultadosLote: LoteCobrancaResult[] = [];

  for (const tipo of tipos) {
    const result = executarLoteCobranca(tipo, {
      filtro,
      diaOverride,
      dataPagamentoBr: dataPagamento,
      salvar,
      outDir,
    });

    totalAlvos += result.resumo.alvos;
    totalMensagens += result.resumo.mensagens;
    totalIgnorados += result.resumo.ignorados;
    resultadosLote.push(result);

    if (tipos.length > 1) {
      console.log(`\n── ${tipo} ──`);
      console.log(
        `Alvos: ${result.resumo.alvos} · Mensagens: ${result.resumo.mensagens} · Ignorados: ${result.resumo.ignorados}`,
      );
    } else {
      console.log(
        `Alvos: ${result.resumo.alvos} · Mensagens: ${result.resumo.mensagens} · Ignorados: ${result.resumo.ignorados}\n`,
      );
    }

    if (result.items.length === 0) {
      console.log("  (nenhum alvo elegível)");
      continue;
    }

    for (const item of result.items) {
      console.log("─".repeat(48));
      const a = item.alvo;
      console.log(`${a.placa} · ${a.clienteNome ?? "(sem cliente)"}`);
      if (item.aviso) console.log(`  ⚠ ${item.aviso}`);
      if (item.arquivos.length) {
        console.log("\n  [arquivos]");
        for (const f of item.arquivos) console.log(`    ${f}`);
      }
    }

    if (salvar && result.items.length) {
      const jsonPath = salvarLoteConsolidado(result, outDir);
      console.log(`\n[lote ${tipo}]\n  ${jsonPath}`);
    }
  }

  if (tipos.length > 1) {
    console.log(
      `\n[total] Alvos: ${totalAlvos} · Mensagens: ${totalMensagens} · Ignorados: ${totalIgnorados}`,
    );
  }

  const escopoUnico = filtro.clienteId != null || filtro.placa != null;
  const dataRef = dataPagamento ?? hojeBr();

  if (escopoUnico) {
    const itemsEscopo = itemsDoEscopo(resultadosLote, filtro);
    const sidecar = montarCobrancaSidecar(filtro, itemsEscopo, dataRef, tipos);
    imprimirCabecalhoContrato(sidecar);
    imprimirBlocoFinalRelatorio(itemsEscopo, {
      pagamentoSemanal: sidecar?.pagamentoSemanal ?? null,
      resumoSemanal: sidecar?.resumoSemanal ?? null,
      mensagensWhatsApp: sidecar?.mensagensWhatsApp ?? [],
    });
  } else {
    imprimirBlocoFinalRelatorio(
      resultadosLote.flatMap((r) => r.items),
      undefined,
    );
  }

  if (salvar) {
    const modoCanvas = resolverModoCanvasCobranca(tipos, filtro);
    const varianteInfracoes = resolverVarianteCanvasInfracoes(argv, tipos, filtro);
    const sidecars = ehRelatorioInfracoesGlobal(tipos, filtro)
      ? salvarRelatorioInfracoesSidecars(resultadosLote, dataRef, {
          outDir,
          variante: varianteInfracoes,
        })
      : modoCanvas === "simples-tipo" || modoCanvas === "simples-placa"
        ? salvarCobrancaSimplesSidecar(resultadosLote, dataRef, {
            outDir,
            filtro,
            tiposSolicitados: tipos,
            modo: modoCanvas,
          })
        : salvarCobrancasSidecar(resultadosLote, dataRef, {
            outDir,
            filtro,
            tiposSolicitados: tipos,
          });
    if (sidecars.length) {
      const modoLabel = ehRelatorioInfracoesGlobal(tipos, filtro)
        ? `relatorio-infracoes · ${varianteInfracoes}`
        : modoCanvas !== "completo"
          ? modoCanvas
          : "";
      console.log(`\n[sidecar canvas${modoLabel ? ` · ${modoLabel}` : ""}]`);
      for (const p of sidecars) console.log(`  ${p}`);

      const jsonSidecars = [...new Set(sidecars.filter((f) => f.endsWith(".json")))];
      if (jsonSidecars.length) {
        console.log("\n[canvas]");
        for (const p of jsonSidecars) {
          try {
            const { repoPath, cursorPath } = gerarCobrancaCanvasDeSidecar(p);
            console.log(`  ${repoPath}`);
            if (cursorPath) console.log(`  ${cursorPath}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`  AVISO: falha ao gerar canvas: ${msg}`);
          }
        }
      }
    }
  }

  if (totalAlvos === 0) {
    console.log("\nNenhum alvo elegível encontrado.");
  }
}
