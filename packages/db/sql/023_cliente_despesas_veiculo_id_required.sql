-- cliente_despesas: veiculo_id obrigatório; remove coluna redundante veiculo_placa.

UPDATE lanza.cliente_despesas cd
SET veiculo_id = v.id
FROM lanza.veiculos v
WHERE cd.veiculo_id IS NULL
  AND v.placa IS NOT NULL
  AND upper(regexp_replace(v.placa, '[^A-Z0-9]', '', 'gi')) =
      upper(regexp_replace(cd.veiculo_placa, '[^A-Z0-9]', '', 'gi'));

DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO orphan_count
  FROM lanza.cliente_despesas
  WHERE veiculo_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'cliente_despesas: % linha(s) sem veiculo_id resolvível — corrija antes de migrar',
      orphan_count;
  END IF;
END $$;

ALTER TABLE lanza.cliente_despesas
  DROP CONSTRAINT IF EXISTS cliente_despesas_veiculo_id_fkey;

ALTER TABLE lanza.cliente_despesas
  ALTER COLUMN veiculo_id SET NOT NULL;

ALTER TABLE lanza.cliente_despesas
  ADD CONSTRAINT cliente_despesas_veiculo_id_fkey
  FOREIGN KEY (veiculo_id) REFERENCES lanza.veiculos (id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS lanza.cliente_despesas_veiculo_placa_idx;

DROP VIEW IF EXISTS lanza.cliente_despesas_legacy;

ALTER TABLE lanza.cliente_despesas
  DROP COLUMN IF EXISTS veiculo_placa;

CREATE OR REPLACE VIEW lanza.cliente_despesas_legacy AS
  SELECT * FROM lanza.cliente_despesas;

COMMENT ON COLUMN lanza.cliente_despesas.veiculo_id IS
  'FK UUID → lanza.veiculos.id (obrigatório; placa via JOIN).';
