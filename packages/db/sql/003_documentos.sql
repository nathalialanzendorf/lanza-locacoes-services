-- Metadados de documentos/relatórios persistidos no Vercel Blob (ou espelho local).

CREATE TABLE IF NOT EXISTS lanza.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'documento',
  nome TEXT NOT NULL,
  mime TEXT,
  bytes BIGINT,
  cliente_id TEXT,
  placa TEXT,
  pacote_id TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON lanza.documentos (tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_cliente ON lanza.documentos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_documentos_placa ON lanza.documentos (placa);
CREATE INDEX IF NOT EXISTS idx_documentos_criado ON lanza.documentos (criado_em DESC);
