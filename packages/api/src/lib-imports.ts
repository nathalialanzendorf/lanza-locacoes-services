/**
 * Ponte única para `src/lib/` — evita espalhar imports relativos nas routes/services.
 * Não altera o código legado; só reexporta o que a API consome.
 */
export {
  loadClientesDb,
  findClienteById,
  findClienteByCpf,
  isClienteAtivo,
  gravarCliente,
  editarCliente,
  excluirCliente,
  type ClienteRegistro,
  type ClientePatch,
} from "../../../src/lib/clientesDb.js";

export type { ClienteImportado } from "../../../src/lib/rastreame/mapMotoristaCliente.js";

export {
  loadVeiculosDb,
  findVeiculoById,
  findVeiculoByPlaca,
  isVeiculoAtivo,
  editarVeiculo,
  excluirVeiculo,
  type VeiculoRegistro,
  type VeiculoPatch,
} from "../../../src/lib/veiculosDb.js";

export {
  loadContratosDb,
  type ContratoRegistro,
} from "../../../src/lib/contratosDb.js";

export {
  loadClienteDespesasDb,
  findClienteDespesaById,
  isClienteDespesaAtiva,
  despesaAtribuidaACliente,
  gravarClienteDespesa,
  editarClienteDespesa,
  excluirClienteDespesa,
  confirmarCondutorClienteDespesa,
  type ClienteDespesaRegistro,
  type ClienteDespesaInput,
  type ClienteDespesaPatch,
} from "../../../src/lib/clienteDespesasDb.js";

export {
  gravarLocacao,
  excluirLocacao,
  loadLocacoesDb,
  type LocacaoRegistro,
} from "../../../src/lib/locacoesDb.js";

export type { LocacaoInput } from "../../../src/lib/locacoesDb.js";

export {
  montarPlanoBaixa,
  resolverCliente,
  type MontarPlanoBaixaInput,
  type LinhaPlanoBaixa,
  type PlanoBaixaRecebimento,
} from "../../../src/lib/recebimento/baixaPlano.js";

export {
  gerarSemanal,
  gerarEstacionamento,
  gerarMultas,
  salvarCobranca,
  salvarCobrancasDados,
  COBRANCAS_OUT_DIR,
  type ResultadoCobranca,
} from "../../../src/lib/cobrancas.js";

export {
  executarLoteCobranca,
  listarResumoAlvos,
  salvarLoteConsolidado,
  buildSemanalAtrasoParaEscopo,
  type LoteCobrancaResult,
  type LoteCobrancaItem,
} from "../../../src/lib/cobrancasLote.js";

export {
  TIPOS_COBRANCA_ACTION,
  ROTULO_TIPO_COBRANCA,
  normalizarTipoCobrancaAction,
  listarEscoposContratosAtivosCobranca,
  resolverModoCanvasCobranca,
  type FiltroAlvosCobranca,
  type TipoCobrancaAction,
} from "../../../src/lib/cobrancasAlvos.js";

export {
  montarCobrancaSidecar,
  salvarCobrancasSidecar,
  salvarCobrancaSimplesSidecar,
  salvarRelatorioInfracoesSidecars,
  ehRelatorioInfracoesGlobal,
  type CobrancaRelatorioSidecar,
} from "../../../src/lib/cobrancasRelatorioSidecar.js";

export type { VarianteCanvasInfracoes } from "../../../src/lib/cobrancasRelatorioSidecar.js";

export { gerarCobrancaCanvasDeSidecar } from "../../../src/lib/gerarCobrancaCanvas.js";

export {
  montarRelatorioInfracoesBlocos,
  type RelatorioInfracoesBlocosDados,
} from "../../../src/lib/relatorioInfracoesBlocos.js";

export {
  calcularEncerramentoContrato,
  formatarEncerramentoTexto,
  formatarEncerramentoWhatsApp,
  type EncerramentoInput,
  type EncerramentoResult,
} from "../../../src/lib/encerrarContrato.js";

export { salvarRelatorioEncerramento } from "../../../src/lib/relatorioEncerramentoArquivo.js";

export {
  montarPacoteCobrancaSemanalAtraso,
  filtrarVencimentosCalculoSemanal,
  jurosMultaDiario,
} from "../../../src/lib/pagamentoSemanalCobranca.js";

export { compararDataBrAsc } from "../../../src/lib/contratoExtrair.js";

export { dataVencimentoSemanalBr } from "../../../src/lib/pagamentoSemanal.js";

export { syncMotoristas } from "../../../src/lib/rastreame/motoristasSync.js";
export { syncRastreaveis } from "../../../src/lib/rastreame/rastreaveisSync.js";
export {
  syncRecebimentos,
  pushRecebimentosToRastreame,
} from "../../../src/lib/rastreame/recebimentosSync.js";
export { pushManutencoesToRastreame } from "../../../src/lib/rastreame/manutencaoSync.js";

export {
  sincronizarPedagiosFrota,
  sincronizarPedagiosVeiculo,
  processarPassagensJson,
  processarPassagensJsonLote,
  normalizarTitulosPedagioNoDb,
  loadPlacasParaSync,
} from "../../../src/lib/pedagioDigital/syncPedagios.js";

export {
  loadVeiculosParaSync,
  processarRespostaDetranSc,
  sincronizarMultasFrotaDetranSc,
  sincronizarMultasPorTicketDetranSc,
  sincronizarMultasVeiculoDetranSc,
} from "../../../src/lib/detranSc/syncVeiculo.js";

export {
  processarDespesasDetranSc,
  sincronizarDespesasFrotaDetranSc,
  sincronizarDespesasPorTicketDetranSc,
  sincronizarDespesasVeiculoDetranSc,
} from "../../../src/lib/detranSc/syncDespesasVeiculo.js";

export {
  loadVeiculosRsParaSync,
  processarRespostaDetranRs,
  sincronizarFrotaDetranRs,
  sincronizarVeiculoDetranRs,
} from "../../../src/lib/detranRs/syncVeiculo.js";

export { ufRegistroDaPlaca } from "../../../src/lib/veiculoUf.js";

export {
  auditarInfracoesSemCondutor,
} from "../../../src/lib/auditarInfracoes.js";

export {
  defaultSeguroComprovantesDirs,
  extrairSeguroComprovantesDirs,
} from "../../../src/lib/extrairSeguroComprovante.js";

export {
  sincronizarParceiroDespesa,
} from "../../../src/lib/parceiroDespesasDb.js";

export { RELATORIOS_SYNC_DIR, ensureRelatoriosDirs } from "../../../src/lib/relatoriosPaths.js";

export type { DetranRsConsultaVeiculo } from "../../../src/lib/detranRs/consulta.js";
