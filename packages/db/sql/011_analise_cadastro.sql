-- Análise de cadastro (antecedentes / triagem LGPD).

CREATE TABLE IF NOT EXISTS lanza.triagens (
  id UUID PRIMARY KEY,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  cpf TEXT NOT NULL,
  cpf_formatado TEXT,
  nome TEXT NOT NULL,
  nascimento TEXT,
  data_consulta TEXT NOT NULL,
  alerta_geral BOOLEAN NOT NULL DEFAULT false,
  aprovado BOOLEAN,
  resumo TEXT,
  relatorio_json TEXT,
  relatorio_txt TEXT,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cpf, data_consulta)
);

CREATE INDEX IF NOT EXISTS triagens_cliente_idx ON lanza.triagens (cliente_id);
CREATE INDEX IF NOT EXISTS triagens_cpf_idx ON lanza.triagens (cpf);

CREATE TABLE IF NOT EXISTS lanza.triagem_lgpd (
  triagem_id UUID PRIMARY KEY REFERENCES lanza.triagens (id) ON DELETE CASCADE,
  base_legal TEXT NOT NULL,
  titular_consentimento BOOLEAN,
  solicitante TEXT,
  finalidade TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanza.triagem_fontes (
  id UUID PRIMARY KEY,
  triagem_id UUID NOT NULL REFERENCES lanza.triagens (id) ON DELETE CASCADE,
  fonte_id TEXT NOT NULL,
  fonte_nome TEXT NOT NULL,
  status TEXT NOT NULL,
  alerta BOOLEAN NOT NULL DEFAULT false,
  observacao TEXT,
  qtd_achados INTEGER NOT NULL DEFAULT 0,
  evidencia TEXT,
  consultado_em TIMESTAMPTZ,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS triagem_fontes_triagem_idx ON lanza.triagem_fontes (triagem_id);

CREATE TABLE IF NOT EXISTS lanza.cliente_analise_registros (
  id UUID PRIMARY KEY,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  cpf TEXT NOT NULL,
  cpf_formatado TEXT,
  nome TEXT NOT NULL,
  fonte TEXT NOT NULL,
  fonte_nome TEXT NOT NULL,
  site TEXT,
  status TEXT NOT NULL,
  alerta BOOLEAN NOT NULL DEFAULT false,
  identificado TEXT,
  evidencia TEXT,
  data_consulta TEXT NOT NULL,
  consultado_em TIMESTAMPTZ,
  analise_id UUID REFERENCES lanza.triagens (id) ON DELETE SET NULL,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cpf, fonte, data_consulta)
);

CREATE INDEX IF NOT EXISTS cliente_analise_registros_cliente_idx ON lanza.cliente_analise_registros (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_analise_registros_cpf_idx ON lanza.cliente_analise_registros (cpf);

CREATE TABLE IF NOT EXISTS lanza.cliente_analise_achados (
  id UUID PRIMARY KEY,
  registro_id UUID NOT NULL REFERENCES lanza.cliente_analise_registros (id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cliente_analise_achados_registro_idx ON lanza.cliente_analise_achados (registro_id);

COMMENT ON TABLE lanza.triagens IS 'Histórico de análises de cadastro (1 por CPF+dia).';
COMMENT ON TABLE lanza.cliente_analise_registros IS 'Achados por fonte/site (BNMP, PF, TJSC).';
