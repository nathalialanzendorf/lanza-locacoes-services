export function cobrancaCanvasDados(j) {
  const pagamentoSemanal = j.pagamentoSemanal ?? null;
  const resumoSemanal = j.resumoSemanal ?? pagamentoSemanal?.resumo ?? null;

  return {
    cliente: j.cliente,
    placa: j.placa,
    modeloVeiculo: j.modeloVeiculo,
    anoModelo: j.anoModelo,
    dataInicio: j.dataInicio ?? j.contrato?.inicio ?? "—",
    dataFim: j.dataFim ?? j.contrato?.fimPrevisto ?? "—",
    qtdDiasContrato: j.qtdDiasContrato ?? j.contrato?.prazoDias ?? 0,
    dataAtual: j.dataAtual ?? j.geradoEmBr ?? j.dataReferencia,
    qtdDiasLocado: j.qtdDiasLocado ?? 0,
    linhaEncerramento: j.linhaEncerramento ?? null,
    valorSemanal: j.contrato?.valorSemanal ?? 0,
    valorDiaria: j.contrato?.valorDiaria ?? 0,
    totalDebitos: j.totalDebitos,
    infracoes: j.infracoes ?? [],
    totalInfracoes: j.totalInfracoes ?? 0,
    infracoesPagas: j.infracoesPagas ?? [],
    totalInfracoesPagas: j.totalInfracoesPagas ?? 0,
    manutencoes: j.manutencoes ?? [],
    totalManutencoes: j.totalManutencoes ?? 0,
    parcelasEmAberto: j.parcelasEmAberto ?? [],
    totalParcelasEmAberto: j.totalParcelasEmAberto ?? 0,
    totalSemanalCobrar: j.totalSemanalCobrar ?? j.totalParcelasEmAberto ?? 0,
    debitosDiversos: j.debitosDiversos ?? [],
    totalDebitosDiversos: j.totalDebitosDiversos ?? 0,
    placasEscopo: j.placasEscopo ?? (j.placa ? [j.placa] : []),
    resumoSemanal,
    pagamentoSemanal: pagamentoSemanal
      ? {
          tabelas: pagamentoSemanal.tabelas ?? [],
          totalGeral: pagamentoSemanal.totalGeral ?? 0,
          dataPagamentoBr: pagamentoSemanal.dataPagamentoBr ?? j.dataReferencia,
        }
      : null,
    mensagensWhatsApp: (j.mensagensWhatsApp ?? []).map((m) => ({
      tipo: m.tipo ?? "",
      titulo: String(m.titulo ?? "")
        .replace(/\r/g, "")
        .replace(/\*/g, "")
        .trim(),
      texto: String(m.texto ?? "").replace(/\r\n/g, "\n"),
    })),
    avisos: j.avisos ?? [],
  };
}
