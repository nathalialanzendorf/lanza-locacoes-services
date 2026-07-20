// Config
export { getPgConfig, pgSslOptions, type PgConfig, type PgSslMode } from "./config.js";

// Paths
export { REPO_ROOT, DATABASE_DIR, SQL_DIR, INITIAL_SCHEMA_SQL } from "./paths.js";

// Auth
export { getRdsIamAuthToken, PgAuthError, resolvePgPassword } from "./auth/iam.js";
export { createVercelPostgresPool } from "./auth/vercel.js";

// Client
export {
  PostgresPool,
  getDefaultPostgresPool,
  getPgPool,
  pgQuery,
  closePgPool,
  setVercelPostgresPool,
  getVercelPostgresPool,
  type PostgresPoolOptions,
} from "./client/PostgresPool.js";

// Stores
export { JSON_STORE_FILES, jsonFileToStoreName, type JsonStoreName } from "./stores/registry.js";
export {
  JsonStoreRepository,
  loadJsonStore,
  saveJsonStore,
} from "./stores/JsonStoreRepository.js";

// Migration
export { SchemaMigrator, runSchemaMigration } from "./migration/SchemaMigrator.js";
export { JsonImporter, importJsonStores, type ImportResult } from "./migration/JsonImporter.js";
export { migratePostgres, type MigrateOptions } from "./migration/migrate.js";
export {
  JsonToRelationalImporter,
  importJsonToRelational,
  type RelationalImportOptions,
  type RelationalImportResult,
} from "./migration/JsonToRelationalImporter.js";

export {
  useRelationalStore,
  skipJsonStoresWrite,
  exportJsonBackup,
  loadParceirosFromSql,
  loadVinculosFromSql,
  saveParceirosToSql,
  upsertParceiroRowToSql,
  deleteParceiroRowFromSql,
  saveVinculosToSql,
  loadVeiculosFromSql,
  saveVeiculosToSql,
  loadClientesFromSql,
  saveClientesToSql,
  loadContratosFromSql,
  saveContratosToSql,
  loadLocacoesFromSql,
  saveLocacoesToSql,
  loadInfracoesFromSql,
  saveInfracoesToSql,
  loadClienteDespesasFromSql,
  saveClienteDespesasToSql,
  loadParceiroDespesasFromSql,
  saveParceiroDespesasToSql,
  loadTriagensFromSql,
  saveTriagensToSql,
  loadClienteAnaliseFromSql,
  saveClienteAnaliseToSql,
  type TriagemDbShape,
  type ClienteAnaliseDbShape,
} from "./repositories/index.js";

// Document store (file | postgres | dual)
export {
  jsonDocumentExists,
  loadJsonDocument,
  loadJsonDocumentForApi,
  saveJsonDocument,
  loadJsonDocumentAsync,
  saveJsonDocumentAsync,
  getDbBackend,
  getJsonDocumentAdapter,
  createJsonDocumentAdapter,
  storeNameFromPath,
  resetJsonDocumentAdapterCache,
  type DbBackend,
  type JsonDocumentAdapter,
  type SaveJsonDocumentOptions,
} from "./documentStore.js";
