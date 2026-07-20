-- Despesas do parceiro/proprietário (IPVA, seguro, manutenção, etc.).

CREATE TABLE IF NOT EXISTS lanza.parceiro_despesas (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  placa TEXT NOT NULL,
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  data TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  competencia TEXT NOT NULL,
  origem TEXT,
  rastreame_manutencao_id TEXT,
  rastreame_sync_em TIMESTAMPTZ,
  rastreame_hash TEXT,
  baixa TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parceiro_despesas_placa_idx ON lanza.parceiro_despesas (placa);
CREATE INDEX IF NOT EXISTS parceiro_despesas_veiculo_idx ON lanza.parceiro_despesas (veiculo_id);
CREATE INDEX IF NOT EXISTS parceiro_despesas_categoria_idx ON lanza.parceiro_despesas (categoria);
CREATE INDEX IF NOT EXISTS parceiro_despesas_competencia_idx ON lanza.parceiro_despesas (competencia);

COMMENT ON TABLE lanza.parceiro_despesas IS 'Despesas do proprietário/parceiro do veículo.';
