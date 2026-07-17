import {
  isClienteAtivo,
  isClienteDespesaAtiva,
  isVeiculoAtivo,
  loadClienteDespesasDb,
  loadClientesDb,
  loadContratosDb,
  loadInfracoesDb,
  loadLocacoesDb,
  loadParceiroDespesasDb,
  loadVeiculosDb,
  obterDashboardRecebimentos,
} from "../lib-imports.js";

function infracaoEmAberto(i: {
  quitadaDetran?: boolean;
  situacao?: string | null;
  status?: string | null;
}): boolean {
  return i.quitadaDetran !== true && !/quitad|pago|paga/i.test(String(i.situacao ?? i.status ?? ""));
}

export function obterResumo() {
  const clientes = loadClientesDb().clientes;
  const veiculos = loadVeiculosDb().veiculos;
  const contratos = loadContratosDb().contratos;
  const despesasCliente = loadClienteDespesasDb().clienteDespesas;
  const despesasParceiro = loadParceiroDespesasDb().parceiroDespesas;
  const infracoes = loadInfracoesDb().infracoes;
  const locacoes = loadLocacoesDb().locacoes;

  const clientesAtivos = clientes.filter(isClienteAtivo);
  const veiculosAtivos = veiculos.filter(isVeiculoAtivo);
  const contratosAtivos = contratos.filter((c) => c.status === "ativo");

  const despesasClienteAbertas = despesasCliente.filter(
    (d) => isClienteDespesaAtiva(d) && !d.paga,
  );
  const despesasParceiroAbertas = despesasParceiro.filter((d) => !String(d.baixa ?? "").trim());

  const infracoesAbertas = infracoes.filter(infracaoEmAberto);
  const infracoesSemCliente = infracoes.filter(
    (i) =>
      infracaoEmAberto(i) &&
      !i.condutorId &&
      !i.debitoParceiroConfirmado &&
      !i.condutorNaoIdentificado,
  );

  const locacoesAbertas = locacoes.filter((l) => !l.fim);

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
    locacoes: { abertas: locacoesAbertas.length },
    recebimentos: obterDashboardRecebimentos(),
  };
}
