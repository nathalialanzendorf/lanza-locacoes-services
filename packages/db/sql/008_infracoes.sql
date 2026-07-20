-- Infrações DETRAN (fonte da verdade).

CREATE TABLE IF NOT EXISTS lanza.infracoes (
  id UUID PRIMARY KEY,
  numero_auto TEXT NOT NULL,
  id_auto_infracao BIGINT,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  veiculo_placa TEXT NOT NULL,
  descricao TEXT NOT NULL,
  data_autuacao TEXT NOT NULL,
  data_hora_autuacao TEXT,
  local_infracao TEXT,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  valor_multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  situacao TEXT,
  status TEXT,
  protocolo TEXT,
  data_limite_defesa TEXT,
  limite_defesa TEXT,
  prazo_defesa_expirado BOOLEAN NOT NULL DEFAULT false,
  data_vencimento_original TEXT,
  convertida_em_debito BOOLEAN NOT NULL DEFAULT false,
  quitada_detran BOOLEAN NOT NULL DEFAULT false,
  status_infracao TEXT,
  status_detran TEXT,
  fonte TEXT,
  condutor_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  condutor_confirmado BOOLEAN NOT NULL DEFAULT false,
  condutor_contrato TEXT,
  condutor_nao_identificado BOOLEAN NOT NULL DEFAULT false,
  revisar_manual BOOLEAN NOT NULL DEFAULT false,
  revisar_motivo TEXT,
  pdf_arquivo TEXT,
  cliente_despesa_id UUID,
  detran_raw JSONB,
  origem TEXT,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS infracoes_numero_auto_lower_idx ON lanza.infracoes (lower(numero_auto));
CREATE INDEX IF NOT EXISTS infracoes_veiculo_placa_idx ON lanza.infracoes (veiculo_placa);
CREATE INDEX IF NOT EXISTS infracoes_veiculo_id_idx ON lanza.infracoes (veiculo_id);
CREATE INDEX IF NOT EXISTS infracoes_condutor_idx ON lanza.infracoes (condutor_id);
CREATE INDEX IF NOT EXISTS infracoes_ativo_idx ON lanza.infracoes (ativo);

COMMENT ON TABLE lanza.infracoes IS 'Infrações sincronizadas do DETRAN SC. Chave natural: numero_auto.';
