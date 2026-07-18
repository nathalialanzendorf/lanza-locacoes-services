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
  loadCobrancasDbContextAsync,
  loadCobrancasDbContextSync,
  type CobrancasDbContext,
} from "../lib-imports.js";

function infracaoEmAberto(i: {
  quitadaDetran?: boolean;
  situacao?: string | null;
  status?: string | null;
}): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

type ResumoStores = {
  despesasCliente: ClienteDespesaRegistro[];
  despesasParceiro: ParceiroDespesaRegistro[];
  infracoes: InfracaoRegistro[];
  cobrancasCtx: CobrancasDbContext;
};

function montarResumo(
  clientes: ClienteRegistro[],
  veiculos: VeiculoRegistro[],
  contratos: ContratoRegistro[],
  stores: ResumoStores,
  recebimentos?: ReturnType<typeof obterDashboardRecebimentos>,
) {
  const { despesasCliente, despesasParceiro, infracoes, cobrancasCtx } = stores;

  const clientesAtivos = clientes.filter(isClienteAtivo);
  const veiculosAtivos = veiculos.filter(isVeiculoAtivo);
  const contratosAtivos = contratos.filter((c) => contratoAtivoOperacional(c));

  const despesasClienteAbertas = despesasCliente.filter((d) =>
    despesaClienteAbertaDashboard(d, cobrancasCtx),
  );
  const despesasParceiroAbertas = despesasParceiro.filter((d) => !String(d.baixa ?? "").trim());

  const infracoesAbertas = infracoes.filter((i) => i.ativo !== false && infracaoEmAberto(i));
  const infracoesSemCliente = infracoes.filter(
    (i) =>
      i.ativo !== false &&
      infracaoEmAberto(i) &&
      !i.condutorId &&
      !i.debitoParceiroConfirmado &&
      !i.condutorNaoIdentificado,
  );

  const totalClienteAberto = despesasClienteAbertas.reduce(
    (s, d) => s + (Number(d.valorMulta) || 0),
    0,
  );
  const totalParceiroAberto = despesasParceiroAbertas.reduce(
    (s, d) => s + (Number(d.valor) || 0),
    0,
  );

  return {
    clientes: { total: clientes.length, ativos: clientesAtivos.length },
    veiculos: { total: veiculos.length, ativos: veiculosAtivos.length },
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
      semCliente: infracoesSemCliente.length,
      semCondutor: infracoesSemCliente.length,
    },
    ...(recebimentos ? { recebimentos } : {}),
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

export async function obterResumoAsync() {
  const [
    clientesDb,
    veiculosDb,
    contratosDb,
    clienteDespesasDb,
    parceiroDespesasDb,
    infracoesDb,
    cobrancasCtx,
  ] = await Promise.all([
    loadClientesDbAsync(),
    loadVeiculosDbAsync(),
    loadContratosDbAsync(),
    loadClienteDespesasDbAsync(),
    loadParceiroDespesasDbAsync(),
    loadInfracoesDbAsync(),
    loadCobrancasDbContextAsync(),
  ]);

  const stores: ResumoStores = {
    despesasCliente: clienteDespesasDb.clienteDespesas,
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

  return montarResumo(
    clientesDb.clientes,
    veiculosDb.veiculos,
    contratosDb.contratos,
    stores,
    recebimentos,
  );
}
