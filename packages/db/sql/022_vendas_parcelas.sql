-- Campos de parcelamento no registo de venda.

ALTER TABLE lanza.vendas
  ADD COLUMN IF NOT EXISTS data_pagamento_parcelas TEXT,
  ADD COLUMN IF NOT EXISTS valor_parcela NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS quantidade_parcelas INTEGER;

COMMENT ON COLUMN lanza.vendas.data_pagamento_parcelas IS 'Data da 1ª parcela (ou vencimento base).';
COMMENT ON COLUMN lanza.vendas.valor_parcela IS 'Valor de cada parcela.';
COMMENT ON COLUMN lanza.vendas.quantidade_parcelas IS 'Quantidade de parcelas.';
