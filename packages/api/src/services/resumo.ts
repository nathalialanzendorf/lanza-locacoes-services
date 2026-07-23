import {
  isClienteAtivo,
  isVeiculoAtivo,
  loadClienteDespesasDb,
  loadClienteDespesasDbAsync,
  loadClientesDb,
  loadClientesDbAsync,
  loadContratosDb,
  loadContratosDbAsync,
  loadInfracoesDb,
  loadInfracoesDbAsync,
  loadParceiroDespesasDb,
  loadParceiroDespesasDbAsync,
  loadVeiculosDb,
  loadVeiculosDbAsync,
  type ClienteDespesaRegistro,
  type ClienteRegistro,
  type ContratoRegistro,
  type InfracaoRegistro,
  type ParceiroDespesaRegistro,
  type VeiculoRegistro,
  contratoAtivoOperacional,
  despesaClienteAbertaDashboard,
  obterDashboardRecebimentos,
  placasIguais,
  loadCobrancasDbContextAsync,
  loadCobrancasDbContextSync,
  type CobrancasDbContext,
  type DashboardRecebimentos,
  clienteExibicaoPorId,
  listarContratosVencimentoDashboard,
  type ContratoVencimentoResumo,
} from "../lib-imports.js";

function infracaoEmAberto(i: {
  quitadaDetran?: boolean;
  situacao?: string | null;
  status?: string | null;
}): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

/** Autuação notificada — ainda sem boleto (prazo de defesa ou não convertida em débito). */
function infracaoNotificada(i: {
  convertidaEmDebito?: boolean;
  dataVencimentoOriginal?: string | null;
}): boolean {
  if (i.convertidaEmDebito === true) return false;
  return !String(i.dataVencimentoOriginal ?? "").trim();
}

/** Débito/boleto gerado — cobrança em aberto no DETRAN. */
function infracaoEmAbertoDebito(i: {
  convertidaEmDebito?: boolean;
  dataVencimentoOriginal?: string | null;
}): boolean {
  if (i.convertidaEmDebito === true) return true;
  return !!String(i.dataVencimentoOriginal ?? "").trim();
}

/** Sem locatário nem parceiro confirmado como responsável. */
function infracaoSemResponsavel(i: {
  condutorId?: string | null;
  debitoParceiroConfirmado?: boolean;
  debitoParceiroId?: string | null;
}): boolean {
  const temCliente = Boolean(String(i.condutorId ?? "").trim());
  const temParceiro =
    i.debitoParceiroConfirmado === true ||
    Boolean(String(i.debitoParceiroId ?? "").trim());
  return !temCliente && !temParceiro;
}

type ResumoStores = {
  despesasCliente: ClienteDespesaRegistro[];
  despesasParceiro: ParceiroDespesaRegistro[];
  infracoes: InfracaoRegistro[];
  cobrancasCtx: CobrancasDbContext;
};

const RECEBIMENTOS_VAZIO: DashboardRecebimentos = {
  dataReferenciaBr: "—",
  tituloPagamentoSemanal: "Pagamento semanal",
  venceHoje: [],
  atrasados: [],
  totais: { venceHoje: 0, atrasado: 0, semanal: 0, caucao: 0, renegociacao: 0 },
};

function recebimentosResumo(
  recebimentos: DashboardRecebimentos | undefined,
  clientes: ClienteRegistro[],
): DashboardRecebimentos {
  const base = recebimentos ?? RECEBIMENTOS_VAZIO;
  return enriquecerRecebimentos(base, clientes) ?? base;
}

function enriquecerRecebimentos(
  recebimentos: DashboardRecebimentos | undefined,
  clientes: ClienteRegistro[],
): DashboardRecebimentos | undefined {
  if (!recebimentos) return undefined;
  const mapLinha = (l: DashboardRecebimentos["venceHoje"][number]) => ({
    ...l,
    clienteNome: clienteExibicaoPorId(clientes, l.clienteId, l.clienteNome),
  });
  return {
    ...recebimentos,
    venceHoje: recebimentos.venceHoje.map(mapLinha),
    atrasados: recebimentos.atrasados.map(mapLinha),
  };
}

function enriquecerContratosVencimento(
  listas: ReturnType<typeof listarContratosVencimentoDashboard>,
  clientes: ClienteRegistro[],
): { vencidos: ContratoVencimentoResumo[]; aVencer: ContratoVencimentoResumo[] } {
  const mapContrato = (c: ContratoVencimentoResumo): ContratoVencimentoResumo => ({
    ...c,
    clienteNome: clienteExibicaoPorId(clientes, c.clienteId, c.clienteNome),
  });
  return {
    vencidos: listas.vencidos.map(mapContrato),
    aVencer: listas.aVencer.map(mapContrato),
  };
}

function montarResumo(
  clientes: ClienteRegistro[],
  veiculos: VeiculoRegistro[],
  contratos: ContratoRegistro[],
  stores: ResumoStores,
  recebimentos?: DashboardRecebimentos,
) {
  const { despesasCliente, despesasParceiro, infracoes, cobrancasCtx } = stores;

  const clientesAtivos = clientes.filter(isClienteAtivo);
  const veiculosAtivos = veiculos.filter(isVeiculoAtivo);
  const contratosAtivos = contratos.filter((c) => contratoAtivoOperacional(c));
  const veiculoTemContratoAtivo = (v: VeiculoRegistro) =>
    contratosAtivos.some((c) => placasIguais(c.placa, v.placa));
  const veiculosLocados = veiculosAtivos.filter(veiculoTemContratoAtivo);
  const veiculosNaoLocados = veiculosAtivos.filter((v) => !veiculoTemContratoAtivo(v));

  const despesasClienteAbertas = despesasCliente.filter((d) =>
    despesaClienteAbertaDashboard(d, cobrancasCtx),
  );
  const despesasParceiroAbertas = despesasParceiro.filter((d) => !String(d.baixa ?? "").trim());

  const infracoesAbertas = infracoes.filter((i) => i.ativo !== false && infracaoEmAberto(i));
  const infracoesNotificadas = infracoesAbertas.filter(infracaoNotificada);
  const infracoesEmAbertoDebito = infracoesAbertas.filter(infracaoEmAbertoDebito);
  const infracoesSemResponsavel = infracoesAbertas.filter(infracaoSemResponsavel);

  const totalClienteAberto = despesasClienteAbertas.reduce(
    (s, d) => s + (Number(d.valorMulta) || 0),
    0,
  );
  const totalParceiroAberto = despesasParceiroAbertas.reduce(
    (s, d) => s + (Number(d.valor) || 0),
    0,
  );

  const contratosVencimento = (() => {
    try {
      return enriquecerContratosVencimento(
        listarContratosVencimentoDashboard(contratos),
        clientes,
      );
    } catch (err) {
      console.error("[resumo] falha ao calcular contratosVencimento:", err);
      return { vencidos: [], aVencer: [] };
    }
  })();

  return {
    clientes: { total: clientes.length, ativos: clientesAtivos.length },
    veiculos: {
      total: veiculos.length,
      ativos: veiculosAtivos.length,
      locados: veiculosLocados.length,
      naoLocados: veiculosNaoLocados.length,
    },
    contratos: { total: contratos.length, ativos: contratosAtivos.length },
    despesasCliente: {
      emAberto: despesasClienteAbertas.length,
      valorEmAberto: totalClienteAberto,
    },
    despesasParceiro: {
      emAberto: despesasParceiroAbertas.length,
      valorEmAberto: totalParceiroAberto,
    },
    infracoes: {
      emAberto: infracoesAbertas.length,
      notificadas: infracoesNotificadas.length,
      emAbertoDebito: infracoesEmAbertoDebito.length,
      semResponsavel: infracoesSemResponsavel.length,
      comVencimento: infracoesEmAbertoDebito.length,
      semCliente: infracoesSemResponsavel.length,
      semCondutor: infracoesSemResponsavel.length,
    },
    contratosVencimento,
    recebimentos: recebimentosResumo(recebimentos, clientes),
  };
}

export function obterResumo() {
  const cobrancasCtx = loadCobrancasDbContextSync();
  const stores: ResumoStores = {
    despesasCliente: loadClienteDespesasDb().clienteDespesas,
    despesasParceiro: loadParceiroDespesasDb().parceiroDespesas,
    infracoes: loadInfracoesDb().infracoes,
    cobrancasCtx,
  };
  let recebimentos;
  try {
    recebimentos = obterDashboardRecebimentos(cobrancasCtx);
  } catch (err) {
    console.error("[resumo] falha ao calcular recebimentos:", err);
  }
  return montarResumo(
    loadClientesDb().clientes,
    loadVeiculosDb().veiculos,
    loadContratosDb().contratos,
    stores,
    recebimentos,
  );
}

let resumoCache: { at: number; data: ReturnType<typeof montarResumo> } | null = null;
const RESUMO_CACHE_MS = 20_000;

export async function obterResumoAsync() {
  if (process.env.VERCEL && resumoCache && Date.now() - resumoCache.at < RESUMO_CACHE_MS) {
    return resumoCache.data;
  }

  const [parceiroDespesasDb, infracoesDb, cobrancasCtx] = await Promise.all([
    loadParceiroDespesasDbAsync(),
    loadInfracoesDbAsync(),
    loadCobrancasDbContextAsync(),
  ]);

  const stores: ResumoStores = {
    despesasCliente: cobrancasCtx.clienteDespesas,
    despesasParceiro: parceiroDespesasDb.parceiroDespesas,
    infracoes: infracoesDb.infracoes,
    cobrancasCtx,
  };

  let recebimentos;
  try {
    recebimentos = obterDashboardRecebimentos(cobrancasCtx);
  } catch (err) {
    console.error("[resumo] falha ao calcular recebimentos:", err);
  }

  try {
    const data = montarResumo(
      cobrancasCtx.clientes,
      cobrancasCtx.veiculos,
      cobrancasCtx.contratos,
      stores,
      recebimentos,
    );
    if (process.env.VERCEL) resumoCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("[resumo] falha ao montar resumo:", err);
    throw err;
  }
}
