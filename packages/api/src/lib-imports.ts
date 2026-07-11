/**
 * Ponte única para `src/lib/` — evita espalhar imports relativos nas routes/services.
 * Não altera o código legado; só reexporta o que a API consome.
 */
export {
  loadClientesDb,
  findClienteById,
  findClienteByCpf,
  isClienteAtivo,
  type ClienteRegistro,
} from "../../../src/lib/clientesDb.js";

export {
  loadVeiculosDb,
  findVeiculoById,
  findVeiculoByPlaca,
  isVeiculoAtivo,
  type VeiculoRegistro,
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
  type ClienteDespesaRegistro,
} from "../../../src/lib/clienteDespesasDb.js";
