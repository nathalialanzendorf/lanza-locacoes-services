-- Status de cobrança do débito do locatário:
--   em_aberto — ainda devido à Lanza
--   pago      — quitado por recebimento (caixa / PagBank)
--   baixado   — quitado sem caixa (ex.: descontado do caução no encerramento)

ALTER TABLE lanza.cliente_despesas
  ADD COLUMN IF NOT EXISTS status_cobranca TEXT NOT NULL DEFAULT 'em_aberto';

UPDATE lanza.cliente_despesas
SET status_cobranca = 'pago'
WHERE paga = true
  AND status_cobranca = 'em_aberto';

ALTER TABLE lanza.cliente_despesas
  DROP CONSTRAINT IF EXISTS cliente_despesas_status_cobranca_check;

ALTER TABLE lanza.cliente_despesas
  ADD CONSTRAINT cliente_despesas_status_cobranca_check
  CHECK (status_cobranca IN ('em_aberto', 'pago', 'baixado'));

CREATE INDEX IF NOT EXISTS cliente_despesas_status_cobranca_idx
  ON lanza.cliente_despesas (status_cobranca);

COMMENT ON COLUMN lanza.cliente_despesas.status_cobranca IS
  'Cobrança Lanza: em_aberto | pago (caixa) | baixado (ex.: caução no encerramento).';
