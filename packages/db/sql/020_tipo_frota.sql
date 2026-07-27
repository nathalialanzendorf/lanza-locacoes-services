-- Classificação da frota: locação, particular ou venda.

ALTER TABLE lanza.veiculos
  ADD COLUMN IF NOT EXISTS tipo_frota TEXT NOT NULL DEFAULT 'locacao';

UPDATE lanza.veiculos
SET tipo_frota = 'particular'
WHERE particular IS TRUE AND tipo_frota = 'locacao';

ALTER TABLE lanza.veiculos
  DROP CONSTRAINT IF EXISTS veiculos_tipo_frota_check;

ALTER TABLE lanza.veiculos
  ADD CONSTRAINT veiculos_tipo_frota_check
  CHECK (tipo_frota IN ('locacao', 'particular', 'venda'));

COMMENT ON COLUMN lanza.veiculos.tipo_frota IS
  'Classificação operacional: locacao (frota), particular (dono) ou venda (estoque).';
