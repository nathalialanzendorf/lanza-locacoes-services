-- Schema v2: CRLV/CNH inline, veiculo_fipe, despesas hub, cliente_analise_cadastro unificado.

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lanza.tipo_despesa AS ENUM (
    'infracao', 'pedagio', 'estacionamento', 'ipva', 'licenciamento',
    'manutencao', 'pagamento_locacao', 'caucao_locacao', 'parcelamento',
    'seguro', 'rastreador', 'outros_parceiro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lanza.analise_cadastro_status AS ENUM ('aprovado', 'reprovado', 'inconclusivo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Veículos: CRLV inline ───────────────────────────────────────────────────

ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS crlv_arquivo TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS exercicio TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS ano_fabricacao INTEGER;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS numero_crv TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS codigo_seguranca_cla TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS especie TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS placa_anterior TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS placa_anterior_uf TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS potencia_cilindrada TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS peso_bruto_total TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS cmt TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS lotacao TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS eixos TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS carroceria TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS proprietario_nome TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS proprietario_documento TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS local_emissao TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS data_emissao TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS crlv_observacoes TEXT;
ALTER TABLE lanza.veiculos ADD COLUMN IF NOT EXISTS crlv_sync_em TIMESTAMPTZ;

UPDATE lanza.veiculos v SET
  crlv_arquivo = c.crlv_arquivo,
  exercicio = c.exercicio,
  ano_fabricacao = c.ano_fabricacao,
  numero_crv = c.numero_crv,
  codigo_seguranca_cla = c.codigo_seguranca_cla,
  especie = c.especie,
  placa_anterior = c.placa_anterior,
  placa_anterior_uf = c.placa_anterior_uf,
  potencia_cilindrada = c.potencia_cilindrada,
  peso_bruto_total = c.peso_bruto_total,
  cmt = c.cmt,
  lotacao = c.lotacao,
  eixos = c.eixos,
  carroceria = c.carroceria,
  proprietario_nome = c.proprietario_nome,
  proprietario_documento = c.proprietario_documento,
  local_emissao = c.local_emissao,
  data_emissao = c.data_emissao,
  crlv_observacoes = c.observacoes,
  crlv_sync_em = c.crlv_sync_em
FROM lanza.veiculo_crlv c
WHERE v.id = c.veiculo_id;

-- ─── veiculo_fipe ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lanza.veiculo_fipe (
  id UUID PRIMARY KEY,
  veiculo_id UUID NOT NULL REFERENCES lanza.veiculos (id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL DEFAULT 'cars',
  marca_code TEXT,
  modelo_code TEXT,
  ano_code TEXT,
  referencia_code TEXT,
  code_fipe TEXT NOT NULL,
  marca_nome TEXT,
  modelo TEXT,
  ano_modelo TEXT,
  combustivel TEXT,
  combustivel_sigla TEXT,
  tipo_veiculo INTEGER,
  valor NUMERIC(14, 2),
  valor_texto TEXT,
  referencia_mes TEXT,
  historico_precos JSONB,
  fipe_url TEXT,
  fipe_raw JSONB,
  origem TEXT,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (veiculo_id, referencia_mes)
);

CREATE INDEX IF NOT EXISTS veiculo_fipe_veiculo_idx ON lanza.veiculo_fipe (veiculo_id);
CREATE INDEX IF NOT EXISTS veiculo_fipe_code_fipe_idx ON lanza.veiculo_fipe (code_fipe);

INSERT INTO lanza.veiculo_fipe (
  id, veiculo_id, code_fipe, modelo, valor_texto, referencia_mes, fipe_url, origem, ativo, cadastrado_em, atualizado_em
)
SELECT
  gen_random_uuid(),
  v.id,
  COALESCE(v.fipe_codigo, v.id::text),
  v.fipe_modelo,
  v.fipe_valor,
  COALESCE(v.fipe_referencia, 'importado'),
  v.fipe_url,
  'migracao-014/fipe',
  true,
  now(),
  now()
FROM lanza.veiculos v
WHERE (v.fipe_codigo IS NOT NULL OR v.fipe_url IS NOT NULL OR v.fipe_modelo IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM lanza.veiculo_fipe f
    WHERE f.veiculo_id = v.id AND f.referencia_mes = COALESCE(v.fipe_referencia, 'importado')
  );

ALTER TABLE lanza.veiculos DROP COLUMN IF EXISTS fipe_url;
ALTER TABLE lanza.veiculos DROP COLUMN IF EXISTS fipe_modelo;
ALTER TABLE lanza.veiculos DROP COLUMN IF EXISTS fipe_codigo;
ALTER TABLE lanza.veiculos DROP COLUMN IF EXISTS fipe_valor;
ALTER TABLE lanza.veiculos DROP COLUMN IF EXISTS fipe_referencia;

DROP TABLE IF EXISTS lanza.veiculo_crlv;

-- ─── Clientes: CNH inline + análise global ────────────────────────────────────

ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_numero_registro TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_categoria TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_primeira_habilitacao TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_data_emissao TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_validade TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_numero_espelho TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_orgao_emissor TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_uf_emissor TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_ear BOOLEAN;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS cnh_observacoes TEXT;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS analise_aprovado BOOLEAN;
ALTER TABLE lanza.clientes ADD COLUMN IF NOT EXISTS analise_avaliado_em TIMESTAMPTZ;

UPDATE lanza.clientes c SET
  cnh_numero_registro = k.numero_registro,
  cnh_categoria = k.categoria,
  cnh_primeira_habilitacao = k.primeira_habilitacao,
  cnh_data_emissao = k.data_emissao,
  cnh_validade = k.validade,
  cnh_numero_espelho = k.numero_espelho,
  cnh_orgao_emissor = k.orgao_emissor,
  cnh_uf_emissor = k.uf_emissor,
  cnh_ear = k.ear,
  cnh_observacoes = k.observacoes,
  cnh_arquivo = COALESCE(c.cnh_arquivo, k.cnh_arquivo)
FROM lanza.cliente_cnh k
WHERE c.id = k.cliente_id;

UPDATE lanza.clientes c SET
  analise_aprovado = e.aprovado,
  analise_avaliado_em = e.avaliado_em
FROM lanza.cliente_analise_espelho e
WHERE c.id = e.cliente_id;

DROP TABLE IF EXISTS lanza.cliente_cnh;
DROP TABLE IF EXISTS lanza.cliente_analise_espelho;
DROP TABLE IF EXISTS lanza.cliente_rastreame_vinculos;

-- ─── Contratos: remove duplicatas ──────────────────────────────────────────────

ALTER TABLE lanza.contratos DROP COLUMN IF EXISTS veiculo_placa;
ALTER TABLE lanza.contratos DROP COLUMN IF EXISTS placa;
ALTER TABLE lanza.contratos DROP COLUMN IF EXISTS cliente_nome;
ALTER TABLE lanza.contratos DROP COLUMN IF EXISTS cpf;
ALTER TABLE lanza.contratos DROP COLUMN IF EXISTS data_inicio_juros_multa_br;
DROP INDEX IF EXISTS lanza.contratos_placa_idx;

-- ─── Domínio: pedágios, estacionamento, ipva, licenciamento ─────────────────

CREATE TABLE IF NOT EXISTS lanza.pedagios (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  passagem_id TEXT NOT NULL,
  data_hora_iso TIMESTAMPTZ,
  data_hora_raw TEXT,
  praca TEXT,
  rodovia TEXT,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  em_aberto BOOLEAN NOT NULL DEFAULT true,
  status_pagamento TEXT,
  condutor_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  condutor_confirmado BOOLEAN NOT NULL DEFAULT false,
  condutor_contrato TEXT,
  condutor_nao_identificado BOOLEAN NOT NULL DEFAULT false,
  portal_raw JSONB,
  origem TEXT,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (passagem_id)
);

CREATE TABLE IF NOT EXISTS lanza.estacionamento (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  sigapay_id TEXT NOT NULL,
  zona TEXT,
  cidade TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  condutor_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  condutor_confirmado BOOLEAN NOT NULL DEFAULT false,
  condutor_contrato TEXT,
  condutor_nao_identificado BOOLEAN NOT NULL DEFAULT false,
  sigapay_raw JSONB,
  origem TEXT,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sigapay_id)
);

CREATE TABLE IF NOT EXISTS lanza.ipva (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  numero_detran_net TEXT NOT NULL,
  exercicio TEXT,
  parcela TEXT,
  classe TEXT,
  descricao TEXT,
  tipo_debito TEXT,
  data_vencimento TEXT,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  situacao_detran TEXT,
  detran_raw JSONB,
  origem TEXT NOT NULL,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem)
);

CREATE TABLE IF NOT EXISTS lanza.licenciamento (
  id UUID PRIMARY KEY,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  numero_detran_net TEXT NOT NULL,
  exercicio TEXT,
  classe TEXT,
  descricao TEXT,
  tipo_debito TEXT,
  data_vencimento TEXT,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  situacao_detran TEXT,
  detran_raw JSONB,
  origem TEXT NOT NULL,
  sync_em TIMESTAMPTZ,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (origem)
);

-- ─── Hub despesas ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lanza.despesas (
  id UUID PRIMARY KEY,
  tipo_despesa lanza.tipo_despesa NOT NULL,
  tipo_despesa_id UUID,
  veiculo_id UUID REFERENCES lanza.veiculos (id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  parceiro_id UUID REFERENCES lanza.parceiros (id) ON DELETE SET NULL,
  titulo TEXT,
  descricao TEXT NOT NULL,
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  data_ocorrencia TEXT,
  data_vencimento TEXT,
  situacao TEXT,
  pago_lanza BOOLEAN NOT NULL DEFAULT false,
  data_pago_lanza TIMESTAMPTZ,
  revisado BOOLEAN NOT NULL DEFAULT false,
  origem TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS despesas_tipo_idx ON lanza.despesas (tipo_despesa, tipo_despesa_id);
CREATE INDEX IF NOT EXISTS despesas_veiculo_idx ON lanza.despesas (veiculo_id);
CREATE INDEX IF NOT EXISTS despesas_cliente_idx ON lanza.despesas (cliente_id);
CREATE INDEX IF NOT EXISTS despesas_parceiro_idx ON lanza.despesas (parceiro_id);
CREATE INDEX IF NOT EXISTS despesas_origem_idx ON lanza.despesas (origem);

-- ─── Infrações: enxugar ──────────────────────────────────────────────────────

ALTER TABLE lanza.infracoes DROP CONSTRAINT IF EXISTS infracoes_cliente_despesa_fk;
ALTER TABLE lanza.infracoes DROP CONSTRAINT IF EXISTS infracoes_parceiro_despesa_fk;

UPDATE lanza.infracoes SET valor = COALESCE(NULLIF(valor, 0), valor_multa) WHERE valor_multa IS NOT NULL;

ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS valor_multa;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS veiculo_placa;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS cliente_despesa_id;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS parceiro_despesa_id;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS debito_parceiro_confirmado;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS debito_parceiro_id;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS revisar_manual;
ALTER TABLE lanza.infracoes DROP COLUMN IF EXISTS revisar_motivo;

DROP INDEX IF EXISTS lanza.infracoes_veiculo_placa_idx;
DROP INDEX IF EXISTS lanza.infracoes_debito_parceiro_idx;
DROP INDEX IF EXISTS lanza.infracoes_parceiro_despesa_idx;

-- ─── cliente_analise_cadastro (unificado) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS lanza.cliente_analise_cadastro (
  id UUID PRIMARY KEY,
  cliente_id UUID REFERENCES lanza.clientes (id) ON DELETE SET NULL,
  cpf TEXT NOT NULL,
  data_consulta DATE NOT NULL,
  consultado_em TIMESTAMPTZ,
  origem TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  status lanza.analise_cadastro_status NOT NULL DEFAULT 'inconclusivo',
  revisado BOOLEAN NOT NULL DEFAULT false,
  revisado_em TIMESTAMPTZ,
  revisado_por UUID REFERENCES lanza.users (id) ON DELETE SET NULL,
  evidencia TEXT,
  achados JSONB,
  base_legal TEXT,
  site_raw JSONB,
  cadastrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cpf, origem, data_consulta)
);

CREATE INDEX IF NOT EXISTS cliente_analise_cadastro_cliente_idx ON lanza.cliente_analise_cadastro (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_analise_cadastro_cpf_idx ON lanza.cliente_analise_cadastro (cpf);

-- Migra cliente_analise_registros → cliente_analise_cadastro
INSERT INTO lanza.cliente_analise_cadastro (
  id, cliente_id, cpf, data_consulta, consultado_em, origem, descricao, status,
  evidencia, achados, cadastrado_em, atualizado_em
)
SELECT
  r.id,
  r.cliente_id,
  r.cpf,
  r.data_consulta::date,
  r.consultado_em,
  r.fonte,
  COALESCE(r.identificado, ''),
  CASE
    WHEN r.alerta THEN 'reprovado'::lanza.analise_cadastro_status
    WHEN r.status IN ('assistido', 'pendente', 'erro', 'pulado') THEN 'inconclusivo'::lanza.analise_cadastro_status
    ELSE 'aprovado'::lanza.analise_cadastro_status
  END,
  r.evidencia,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('tipo', a.tipo, 'descricao', a.descricao) ORDER BY a.ordem)
     FROM lanza.cliente_analise_achados a WHERE a.registro_id = r.id),
    '[]'::jsonb
  ),
  r.cadastrado_em,
  r.atualizado_em
FROM lanza.cliente_analise_registros r
ON CONFLICT (cpf, origem, data_consulta) DO NOTHING;

-- base_legal de triagem_lgpd (mesmo dia/cpf nas linhas da triagem)
UPDATE lanza.cliente_analise_cadastro c SET base_legal = l.base_legal
FROM lanza.triagens t
JOIN lanza.triagem_lgpd l ON l.triagem_id = t.id
WHERE c.cpf = t.cpf AND c.data_consulta = t.data_consulta::date AND c.base_legal IS NULL;

DROP TABLE IF EXISTS lanza.cliente_analise_achados;
DROP TABLE IF EXISTS lanza.cliente_analise_registros;
DROP TABLE IF EXISTS lanza.triagem_fontes;
DROP TABLE IF EXISTS lanza.triagem_lgpd;
DROP TABLE IF EXISTS lanza.triagens;

-- ─── Views legado (transição) ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW lanza.cliente_despesas_legacy AS
  SELECT * FROM lanza.cliente_despesas;

CREATE OR REPLACE VIEW lanza.parceiro_despesas_legacy AS
  SELECT * FROM lanza.parceiro_despesas;

COMMENT ON TABLE lanza.despesas IS 'Hub de débitos v2 (substitui cliente_despesas/parceiro_despesas gradualmente).';
COMMENT ON TABLE lanza.cliente_analise_cadastro IS 'Análise de cadastro: 1 linha por CPF × site × data.';
