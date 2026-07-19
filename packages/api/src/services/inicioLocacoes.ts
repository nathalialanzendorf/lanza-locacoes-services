import {
  derivarInicioLocacoesAsync,
  gravarInicioLocacoesDerivadoAsync,
} from "../lib-imports.js";

export async function listarInicioLocacoesDerivado() {
  const m = await derivarInicioLocacoesAsync();
  const items = [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([placa, data]) => ({ placa, inicio: data }));
  return { total: items.length, items };
}

export async function derivarInicioLocacoesVeiculos(opts: {
  sobrescrever?: boolean;
  dryRun?: boolean;
}) {
  const resultados = await gravarInicioLocacoesDerivadoAsync({
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
