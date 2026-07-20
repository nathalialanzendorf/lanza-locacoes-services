-- CRLV (campos do documento), CNH completa e campos DETRAN adicionais em infrações.

CREATE TABLE IF NOT EXISTS lanza.veiculo_crlv (
  veiculo_id UUID PRIMARY KEY REFERENCES lanza.veiculos (id) ON DELETE CASCADE,
  crlv_arquivo TEXT,
  exercicio TEXT,
  ano_fabricacao INTEGER,
  numero_crv TEXT,
  codigo_seguranca_cla TEXT,
  especie TEXT,
  placa_anterior TEXT,
  placa_anterior_uf TEXT,
  potencia_cilindrada TEXT,
  peso_bruto_total TEXT,
  cmt TEXT,
  lotacao TEXT,
  eixos TEXT,
  carroceria TEXT,
  proprietario_nome TEXT,
  proprietario_documento TEXT,
  local_emissao TEXT,
  data_emissao TEXT,
  observacoes TEXT,
  crlv_sync_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lanza.veiculo_crlv IS 'Campos extraídos do CRLV (1:1 com veículo). Complementa lanza.veiculos.';

ALTER TABLE lanza.cliente_cnh
  ADD COLUMN IF NOT EXISTS cnh_arquivo TEXT;

COMMENT ON COLUMN lanza.cliente_cnh.cnh_arquivo IS 'Caminho do PDF/imagem da CNH (espelho de clientes.cnh_arquivo).';

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS complemento TEXT;

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS senha_detran TEXT;

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS notificacao_pdf_arquivo TEXT;

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS debito_parceiro_confirmado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS debito_parceiro_id UUID REFERENCES lanza.parceiros (id) ON DELETE SET NULL;

ALTER TABLE lanza.infracoes
  ADD COLUMN IF NOT EXISTS parceiro_despesa_id UUID;

ALTER TABLE lanza.infracoes
  DROP CONSTRAINT IF EXISTS infracoes_parceiro_despesa_fk;

ALTER TABLE lanza.infracoes
  ADD CONSTRAINT infracoes_parceiro_despesa_fk
  FOREIGN KEY (parceiro_despesa_id) REFERENCES lanza.parceiro_despesas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS infracoes_debito_parceiro_idx ON lanza.infracoes (debito_parceiro_id);
CREATE INDEX IF NOT EXISTS infracoes_parceiro_despesa_idx ON lanza.infracoes (parceiro_despesa_id);
