-- json_stores: legado (1 linha = ficheiro JSON inteiro). Não usar para novos writes.

COMMENT ON TABLE lanza.json_stores IS
  'LEGADO — espelho documento de database/*.json. Substituído por tabelas relacional (004+). Read-only após migração.';

CREATE OR REPLACE VIEW lanza.json_stores_legacy AS
  SELECT store_name, description, atualizado_em,
         jsonb_typeof(data) AS data_type,
         pg_column_size(data) AS data_bytes
  FROM lanza.json_stores;

COMMENT ON VIEW lanza.json_stores_legacy IS 'Vista read-only para auditoria do armazenamento legado JSONB.';
