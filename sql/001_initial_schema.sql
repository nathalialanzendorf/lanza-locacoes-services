-- Schema inicial Lanza — espelha database/*.json como documentos JSONB.
-- Executar com: npm run lanza -- postgres migrate

CREATE SCHEMA IF NOT EXISTS lanza;

COMMENT ON SCHEMA lanza IS 'Dados operacionais Lanza (migração de database/*.json)';

CREATE TABLE IF NOT EXISTS lanza.json_stores (
  store_name TEXT PRIMARY KEY,
  description TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lanza.json_stores IS
  'Um registro por ficheiro JSON (ex.: clientes, veiculos). Coluna data = conteúdo integral do JSON.';

CREATE INDEX IF NOT EXISTS json_stores_data_gin ON lanza.json_stores USING gin (data);
