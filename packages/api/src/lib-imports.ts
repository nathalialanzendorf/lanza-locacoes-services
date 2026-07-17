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
  loadVeiculosDbAsync,
  saveVeiculosDb,
  editarVeiculo,
  excluirVeiculo,
  findVeiculoById,
  findVeiculoByPlaca,
  isVeiculoAtivo,
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

export {
  obterDashboardRecebimentos,
  type DashboardRecebimentos,
  type DashboardRecebimentoLinha,
  type DashboardRecebimentosTotais,
} from "../../../src/lib/dashboardRecebimentos.js";

export {
  blobKey,
  blobReadWriteToken,
  deleteBlob,
  getBytes,
  getText,
  headBlob,
  isBlobConfigured,
  isStorageActive,
  listBlobs,
  localMirrorRoot,
  mirrorLocalFilesToBlob,
  putBytes,
  putJson,
  putText,
  storagePrefix,
  type ListBlobsResult,
  type MirrorLocalFilesResult,
  type StoredBlob,
} from "../../../packages/storage/src/index.js";

export { compararDataBrAsc } from "../../../src/lib/contratoExtrair.js";

export { dataVencimentoSemanalBr } from "../../../src/lib/pagamentoSemanal.js";

export { syncMotoristas } from "../../../src/lib/rastreame/motoristasSync.js";
export { syncRastreaveis, preencherFipeFaltante } from "../../../src/lib/rastreame/rastreaveisSync.js";
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

export { REPO_ROOT } from "../../../src/lib/repoRoot.js";

export {
  defaultDocumentosRaiz,
  importarClientesCnh,
  listarPastasComCnh,
  type ImportarCnhResult,
} from "../../../src/lib/importarClientesCnh.js";

export {
  lerDocumentoUpload,
  type DocTipoUpload,
  type CnhParseResult,
  type ComprovanteParseResult,
  type CrlvParseResult,
} from "../../../src/lib/documentosParse.js";

export {
  gravarRastreameEspelhoConfig,
  obterRastreameEspelhoConfig,
  rastreameEspelhoGlobal,
  resolveSyncRastreame,
  type RastreameEspelhoConfig,
} from "../../../src/lib/rastreameEspelhoConfig.js";

export {
  listarMarcas,
  listarModelos,
  listarAnos,
  consultarValor,
  montarUrlFipe,
  resolverFipeVeiculo,
} from "../../../src/lib/fipe/index.js";

export {
  executarTriagem,
  type FonteId,
} from "../../../src/lib/analiseCadastro/index.js";

export {
  caminhoBase,
  gravarRelatorio,
  montarRelatorio,
  type DadosLgpd,
  type RelatorioTriagem,
} from "../../../src/lib/analiseCadastro/relatorio.js";

export {
  listarTriagens,
  loadTriagemDb,
  registrarTriagem,
  saveTriagemDb,
  ultimaTriagemPorCpf,
  type TriagemRegistro,
} from "../../../src/lib/analiseCadastro/triagemDb.js";

export { registrarAchadosCliente } from "../../../src/lib/analiseCadastro/clienteAnaliseDb.js";

export type { DadosLocatario, ResultadoFonte } from "../../../src/lib/analiseCadastro/tipos.js";

export {
  analiseClienteDeRegistro,
  registrarAnaliseCadastroNoCliente,
} from "../../../src/lib/clientesDb.js";

export {
  loginRastreame,
  fetchRastreameToken,
} from "../../../src/lib/rastreame/auth.js";

export {
  buildMotoristaPayload,
  findMotorista,
  listMotoristas,
  postMotoristaPayload,
  putMotorista,
  fetchMotoristaByKey,
  type MotoristaRastreame,
} from "../../../src/lib/rastreame/motorista.js";

export {
  fetchGastosList,
  fetchGastoById,
  postGasto,
  putGasto,
} from "../../../src/lib/rastreame/gasto.js";

export {
  loadInfracoesDb,
  findInfracaoByNumeroAuto,
  confirmarDebitoParceiroInfracao,
  vincularClienteDespesaInfracao,
  type InfracaoRegistro,
} from "../../../src/lib/infracoesDb.js";

export {
  loadParceiroDespesasDb,
  saveParceiroDespesasDb,
  gravarParceiroDespesaManual,
  marcarBaixaParceiroDespesa,
  type ParceiroDespesaInput,
  type ParceiroDespesaRegistro,
} from "../../../src/lib/parceiroDespesasDb.js";

export {
  registrarContrato,
  encerrarContratoDb,
  excluirContrato,
  validarModoContrato,
  type MotivoEncerramento,
} from "../../../src/lib/contratosDb.js";

export {
  ativarClienteDoContrato,
  desativarClienteDoContrato,
} from "../../../src/lib/contratoClienteStatus.js";

export { gerar, type GerarContratoDados } from "../../../src/lib/docxGerar.js";

export {
  montarDadosContratoFromDb,
  type MontarContratoDbInput,
} from "../../../src/lib/montarDadosContrato.js";

export {
  montarPrestacaoContas,
  type PrestacaoContasInput,
  type PrestacaoContasResult,
} from "../../../src/cli/montarRelatorio.js";

export {
  executarRenegociacao,
  listarDebitosAbertos,
  somarDebitos,
  validarParcelas,
  type RenegociacaoInput,
  type ParcelaRenegociacao,
  type ResumoDebito,
} from "../../../src/lib/rastreame/renegociacao.js";

export { formatPlacaHyphen, placasIguais, compactPlaca } from "../../../src/lib/placa.js";

export {
  readLanzaPaths,
  defaultContratosDir,
  prestacaoContasBaseDir,
} from "../../../src/lib/lanzaPaths.js";

export {
  listarLocacoes,
  sugerirLocacoes,
  type SugerirOpts,
  type SugestaoLocacoes,
} from "../../../src/lib/locacoesDb.js";

export {
  reconciliarCondutores,
  type ReconResult,
} from "../../../src/lib/atribuirCondutores.js";

export {
  listarClienteAnalise,
  type RegistroClienteAnalise,
} from "../../../src/lib/analiseCadastro/clienteAnaliseDb.js";

export {
  importarClientesRastreame,
  type ImportarClientesResult,
} from "../../../src/lib/importarClientesRastreame.js";

export {
  lancarRastreadorFixo,
  competenciaAtual,
  RASTREADOR_VALOR_PADRAO,
  RASTREADOR_DIA_PADRAO,
} from "../../../src/lib/rastreadorFixo.js";

export {
  derivarInicioLocacoes,
  gravarInicioLocacoesDerivado,
} from "../../../src/lib/inicioLocacoes.js";

export {
  checkPagBankAuth,
  pagBankAuthConfigured,
} from "../../../src/lib/pagbank/auth.js";

export {
  fetchAllCreditosPagBank,
  fetchCreditosPagBank,
  defaultDateRange,
} from "../../../src/lib/pagbank/statements.js";

export {
  montarLotePagBank,
  type LotePagBankResult,
} from "../../../src/lib/pagbank/matchLote.js";

export {
  registrarPlaca,
  excluirPlacaPorPlaca,
  listarVeiculos as listarVeiculosPedagio,
} from "../../../src/lib/pedagioDigital/veiculos.js";

export {
  listarPassagens,
  type PassagemStatus,
} from "../../../src/lib/pedagioDigital/passagens.js";

export {
  sincronizarVeiculosCrlv,
  type SincronizarVeiculosCrlvOpts,
  type SincronizarVeiculosCrlvResult,
} from "../../../src/cli/sincronizarVeiculosCrlv.js";

export {
  importarContratos,
  type ImportarContratosOpts,
  type ImportarContratosResult,
} from "../../../src/cli/importarContratos.js";

export {
  lancarSemanalRastreame,
  type LancarSemanalRastreameOpts,
  type LancarSemanalRastreameResult,
} from "../../../src/cli/rastreameLancarSemanal.js";
