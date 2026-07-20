-- Linha do tempo de locação/reserva/manutenção por veículo.

CREATE TABLE IF NOT EXISTS lanza.locacoes (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  placa TEXT NOT NULL,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  condutor_nome TEXT,
  contrato_id UUID REFERENCES lanza.contratos (id) ON DELETE SET NULL,
  situacao TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT,
  tipo_locacao TEXT,
  valor_cobrado NUMERIC(12, 2),
  valor_pago NUMERIC(12, 2),
  substitui_veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  substitui_placa TEXT,
  observacao TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locacoes_veiculo_idx ON lanza.locacoes (veiculo_id);
CREATE INDEX IF NOT EXISTS locacoes_cliente_idx ON lanza.locacoes (cliente_id);
CREATE INDEX IF NOT EXISTS locacoes_placa_idx ON lanza.locacoes (placa);
CREATE INDEX IF NOT EXISTS locacoes_situacao_idx ON lanza.locacoes (situacao);

COMMENT ON TABLE lanza.locacoes IS 'Períodos de locado, reserva e manutenção por veículo.';
