-- Tarifas padrão de locação por veículo (semanal, mensal, diária e caução).

ALTER TABLE lanza.veiculos
  ADD COLUMN IF NOT EXISTS valor_semanal NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS valor_mensal NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS valor_caucao NUMERIC(12, 2);

COMMENT ON COLUMN lanza.veiculos.valor_semanal IS 'Valor semanal padrão de locação do veículo.';
COMMENT ON COLUMN lanza.veiculos.valor_mensal IS 'Valor mensal padrão de locação do veículo.';
COMMENT ON COLUMN lanza.veiculos.valor_diaria IS 'Diária padrão (locação ou juros/multa de atraso).';
COMMENT ON COLUMN lanza.veiculos.valor_caucao IS 'Caução padrão do veículo.';
