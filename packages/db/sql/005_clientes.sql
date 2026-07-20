-- Clientes (locatários/motoristas) normalizados.

CREATE TABLE IF NOT EXISTS lanza.clientes (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  cpf_norm TEXT,
  rg TEXT,
  rg_orgao_expedidor TEXT,
  data_nascimento TEXT,
  local_nascimento TEXT,
  filiacao TEXT,
  telefone TEXT,
  email TEXT,
  cnh_arquivo TEXT,
  pasta_contrato_origem TEXT,
  origem_importacao TEXT,
  rastreame_motorista_key TEXT,
  rastreame_motorista_id TEXT,
  rastreame_sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clientes_cpf_norm_idx ON lanza.clientes (cpf_norm) WHERE cpf_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS clientes_nome_lower_idx ON lanza.clientes (lower(nome));
CREATE INDEX IF NOT EXISTS clientes_ativo_idx ON lanza.clientes (ativo);

COMMENT ON TABLE lanza.clientes IS 'Clientes/locatários da frota. Chave natural: CPF.';

CREATE TABLE IF NOT EXISTS lanza.cliente_cnh (
  cliente_id UUID PRIMARY KEY REFERENCES lanza.clientes (id) ON DELETE CASCADE,
  numero_registro TEXT,
  categoria TEXT,
  primeira_habilitacao TEXT,
  data_emissao TEXT,
  validade TEXT,
  numero_espelho TEXT,
  orgao_emissor TEXT,
  uf_emissor TEXT,
  ear BOOLEAN,
  observacoes TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanza.cliente_enderecos (
  cliente_id UUID PRIMARY KEY REFERENCES lanza.clientes (id) ON DELETE CASCADE,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanza.cliente_analise_espelho (
  cliente_id UUID PRIMARY KEY REFERENCES lanza.clientes (id) ON DELETE CASCADE,
  aprovado BOOLEAN,
  data_consulta TEXT,
  alerta_geral BOOLEAN NOT NULL DEFAULT false,
  resumo TEXT,
  analise_id UUID,
  relatorio_txt TEXT,
  avaliado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanza.cliente_rastreame_vinculos (
  id UUID PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES lanza.clientes (id) ON DELETE CASCADE,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  veiculo_placa TEXT,
  rastreavel_key TEXT NOT NULL,
  vinculado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_rastreame_vinculos_cliente_idx ON lanza.cliente_rastreame_vinculos (cliente_id);

ALTER TABLE lanza.veiculos
  DROP CONSTRAINT IF EXISTS veiculos_cliente_vinculado_fk;

ALTER TABLE lanza.veiculos
  ADD CONSTRAINT veiculos_cliente_vinculado_fk
  FOREIGN KEY (cliente_vinculado_id) REFERENCES lanza.clientes (id) ON DELETE SET NULL;
