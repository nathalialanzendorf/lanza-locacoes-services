-- Registos de venda de veículos (comprador, valor, data).

CREATE TABLE IF NOT EXISTS lanza.vendas (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  placa TEXT NOT NULL,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  comprador_nome TEXT,
  data_venda TEXT NOT NULL,
  valor_venda NUMERIC(12, 2) NOT NULL,
  valor_entrada NUMERIC(12, 2),
  data_pagamento_parcelas TEXT,
  valor_parcela NUMERIC(12, 2),
  quantidade_parcelas INTEGER,
  forma_pagamento TEXT,
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendas_veiculo_idx ON lanza.vendas (veiculo_id);
CREATE INDEX IF NOT EXISTS vendas_cliente_idx ON lanza.vendas (cliente_id);
CREATE INDEX IF NOT EXISTS vendas_placa_idx ON lanza.vendas (placa);
CREATE INDEX IF NOT EXISTS vendas_data_idx ON lanza.vendas (data_venda);

COMMENT ON TABLE lanza.vendas IS 'Vendas de veículos do estoque (tipo_frota = venda).';
