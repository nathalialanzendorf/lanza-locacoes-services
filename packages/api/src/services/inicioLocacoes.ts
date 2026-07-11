import {
  derivarInicioLocacoes,
  gravarInicioLocacoesDerivado,
} from "../lib-imports.js";

export function listarInicioLocacoesDerivado() {
  const m = derivarInicioLocacoes();
  const items = [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([placa, data]) => ({ placa, inicio: data }));
  return { total: items.length, items };
}

export function derivarInicioLocacoesVeiculos(opts: {
  sobrescrever?: boolean;
  dryRun?: boolean;
}) {
  const resultados = gravarInicioLocacoesDerivado({
    sobrescrever: opts.sobrescrever ?? false,
    dryRun: opts.dryRun ?? false,
  });
  return {
    total: resultados.length,
    definidos: resultados.filter((r) => r.acao === "definido").length,
    atualizados: resultados.filter((r) => r.acao === "atualizado").length,
    mantidos: resultados.filter((r) => r.acao === "mantido").length,
    semDados: resultados.filter((r) => r.acao === "sem-dados").length,
    itens: resultados,
  };
}
