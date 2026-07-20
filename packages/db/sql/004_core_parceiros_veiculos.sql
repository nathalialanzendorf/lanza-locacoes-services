-- Core: parceiros (proprietários) e veículos da frota.

CREATE TABLE IF NOT EXISTS lanza.parceiros (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS parceiros_nome_lower_idx ON lanza.parceiros (lower(trim(nome)));

COMMENT ON TABLE lanza.parceiros IS 'Proprietários dos veículos da frota (parceiros de locação).';

CREATE TABLE IF NOT EXISTS lanza.veiculos (
  id UUID PRIMARY KEY,
  placa TEXT NOT NULL,
  placa_norm TEXT NOT NULL,
  marca_modelo TEXT,
  marca TEXT,
  modelo TEXT,
  ano_modelo TEXT,
  ano INTEGER,
  chassi TEXT,
  renavam TEXT,
  cor TEXT,
  combustivel TEXT,
  categoria TEXT,
  tipo TEXT,
  licenca_ima TEXT,
  vencimento_documento TEXT,
  uf_registro TEXT,
  fipe_url TEXT,
  fipe_modelo TEXT,
  fipe_codigo TEXT,
  fipe_valor TEXT,
  fipe_referencia TEXT,
  rastreame_rastreavel_key TEXT,
  rastreame_label TEXT,
  rastreame_sync_em TIMESTAMPTZ,
  cliente_vinculado_id UUID,
  inicio_locacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  particular BOOLEAN NOT NULL DEFAULT false,
  origem TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS veiculos_placa_norm_idx ON lanza.veiculos (placa_norm);

COMMENT ON TABLE lanza.veiculos IS 'Frota de veículos. Chave natural: placa.';

CREATE TABLE IF NOT EXISTS lanza.parceiro_veiculo_vinculos (
  id UUID PRIMARY KEY,
  parceiro_id UUID NOT NULL REFERENCES lanza.parceiros (id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES lanza.veiculos (id) ON DELETE CASCADE,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parceiro_id, veiculo_id)
);

CREATE INDEX IF NOT EXISTS parceiro_veiculo_veiculo_idx ON lanza.parceiro_veiculo_vinculos (veiculo_id);
CREATE INDEX IF NOT EXISTS parceiro_veiculo_parceiro_idx ON lanza.parceiro_veiculo_vinculos (parceiro_id);

COMMENT ON TABLE lanza.parceiro_veiculo_vinculos IS 'Vínculo veículo ↔ parceiro (proprietário).';
