-- Débitos cobráveis do locatário (Gastos Gerais / cliente-despesas).

CREATE TABLE IF NOT EXISTS lanza.cliente_despesas (
  id UUID PRIMARY KEY,
  categoria TEXT,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  veiculo_placa TEXT NOT NULL,
  auto_infracao TEXT NOT NULL,
  titulo TEXT,
  descricao TEXT NOT NULL,
  numero_auto TEXT,
  local_infracao TEXT,
  data_autuacao TEXT NOT NULL,
  valor_multa NUMERIC(12, 2) NOT NULL DEFAULT 0,
  situacao TEXT,
  limite_defesa TEXT,
  data_limite_defesa TEXT,
  data_vencimento_original TEXT,
  convertida_em_debito BOOLEAN NOT NULL DEFAULT false,
  condutor_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  condutor_confirmado BOOLEAN NOT NULL DEFAULT false,
  condutor_contrato TEXT,
  condutor_nao_identificado BOOLEAN NOT NULL DEFAULT false,
  debito_parceiro_confirmado BOOLEAN NOT NULL DEFAULT false,
  debito_parceiro_id UUID REFERENCES lanza.parceiros (id) ON DELETE SET NULL,
  revisar_manual BOOLEAN NOT NULL DEFAULT false,
  revisar_motivo TEXT,
  paga BOOLEAN NOT NULL DEFAULT false,
  paga_em TIMESTAMPTZ,
  quitada_detran BOOLEAN NOT NULL DEFAULT false,
  status_infracao TEXT,
  status_detran TEXT,
  rastreame_id TEXT,
  rastreame_motorista_key TEXT,
  rastreame_rastreavel_key TEXT,
  rastreame_data_iso TIMESTAMPTZ,
  rastreame_tipo TEXT,
  rastreame_sync_em TIMESTAMPTZ,
  detran_auto_infracao TEXT,
  pdf_arquivo TEXT,
  infracao_id UUID REFERENCES lanza.infracoes (id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  origem TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_despesas_veiculo_placa_idx ON lanza.cliente_despesas (veiculo_placa);
CREATE INDEX IF NOT EXISTS cliente_despesas_veiculo_id_idx ON lanza.cliente_despesas (veiculo_id);
CREATE INDEX IF NOT EXISTS cliente_despesas_condutor_idx ON lanza.cliente_despesas (condutor_id);
CREATE INDEX IF NOT EXISTS cliente_despesas_categoria_idx ON lanza.cliente_despesas (categoria);
CREATE INDEX IF NOT EXISTS cliente_despesas_paga_idx ON lanza.cliente_despesas (paga);
CREATE INDEX IF NOT EXISTS cliente_despesas_auto_infracao_idx ON lanza.cliente_despesas (lower(auto_infracao));
CREATE INDEX IF NOT EXISTS cliente_despesas_ativo_idx ON lanza.cliente_despesas (ativo);

ALTER TABLE lanza.infracoes
  DROP CONSTRAINT IF EXISTS infracoes_cliente_despesa_fk;

ALTER TABLE lanza.infracoes
  ADD CONSTRAINT infracoes_cliente_despesa_fk
  FOREIGN KEY (cliente_despesa_id) REFERENCES lanza.cliente_despesas (id) ON DELETE SET NULL;

COMMENT ON TABLE lanza.cliente_despesas IS 'Débitos cobráveis do locatário (multas, pedágio, locação, etc.).';
