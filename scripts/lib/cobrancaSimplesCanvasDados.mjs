export function cobrancaSimplesCanvasDados(j) {
  return {
    titulo: j.titulo ?? "Relatório de cobranças",
    geradoEmBr: j.geradoEmBr ?? j.dataReferencia ?? "",
    grupos: (j.grupos ?? []).map((g) => ({
      titulo: g.titulo ?? "",
      subtitulo: g.subtitulo ?? undefined,
      linhas: (g.linhas ?? []).map((l) => ({
        descricao: l.descricao ?? "",
        placa: l.placa ?? "",
        data: l.data ?? "—",
        categoria: l.categoria ?? "",
        valor: Number(l.valor) || 0,
      })),
      total: Number(g.total) || 0,
    })),
    totalGeral: Number(j.totalGeral) || 0,
  };
}
