-- Contratos de locação.

CREATE TABLE IF NOT EXISTS lanza.contratos (
  id UUID PRIMARY KEY,
  versao INTEGER NOT NULL DEFAULT 1,
  contrato_anterior_id UUID REFERENCES lanza.contratos (id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  veiculo_placa TEXT NOT NULL,
  pasta_contrato TEXT,
  cliente_nome TEXT NOT NULL,
  placa TEXT NOT NULL,
  cpf TEXT,
  data_inicio TEXT NOT NULL,
  data_fim_prevista TEXT NOT NULL,
  data_encerramento TEXT,
  quebra_contrato BOOLEAN NOT NULL DEFAULT false,
  motivo_encerramento TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  prazo_dias INTEGER NOT NULL DEFAULT 0,
  tipo_contrato TEXT NOT NULL,
  dia_pagamento_semana TEXT,
  dia_pagamento_mes INTEGER,
  dia_pagamento_texto TEXT,
  valor_semanal NUMERIC(12, 2),
  valor_mensal NUMERIC(12, 2),
  valor_diaria NUMERIC(12, 2),
  valor_caucao NUMERIC(12, 2) NOT NULL DEFAULT 0,
  data_inicio_juros_multa_br TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contratos_cliente_idx ON lanza.contratos (cliente_id);
CREATE INDEX IF NOT EXISTS contratos_veiculo_idx ON lanza.contratos (veiculo_id);
CREATE INDEX IF NOT EXISTS contratos_placa_idx ON lanza.contratos (placa);
CREATE INDEX IF NOT EXISTS contratos_status_idx ON lanza.contratos (status);

COMMENT ON TABLE lanza.contratos IS 'Contratos de locação (ativos e encerrados).';

CREATE TABLE IF NOT EXISTS lanza.contrato_cliente_snapshots (
  contrato_id UUID PRIMARY KEY REFERENCES lanza.contratos (id) ON DELETE CASCADE,
  cliente_ref_id UUID,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  telefone TEXT,
  email TEXT,
  cnh_categoria TEXT,
  cnh_validade TEXT,
  endereco_cep TEXT,
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanza.contrato_veiculo_snapshots (
  contrato_id UUID PRIMARY KEY REFERENCES lanza.contratos (id) ON DELETE CASCADE,
  veiculo_ref_id UUID,
  placa TEXT NOT NULL,
  marca_modelo TEXT,
  fipe_modelo TEXT,
  ano_modelo TEXT,
  chassi TEXT,
  renavam TEXT,
  cor TEXT,
  fipe_valor TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
