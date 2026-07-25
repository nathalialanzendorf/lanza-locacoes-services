-- Contrato assinado (PDF/DOCX) no Vercel Blob.

ALTER TABLE lanza.contratos
  ADD COLUMN IF NOT EXISTS contrato_assinado_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS contrato_assinado_nome TEXT;

COMMENT ON COLUMN lanza.contratos.contrato_assinado_storage_key IS
  'Chave Vercel Blob (pathname) do contrato assinado pelo locatário.';
COMMENT ON COLUMN lanza.contratos.contrato_assinado_nome IS
  'Nome original do ficheiro enviado (ex.: Contrato assinado.pdf).';
