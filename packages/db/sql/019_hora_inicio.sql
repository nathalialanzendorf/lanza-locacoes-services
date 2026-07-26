-- Horário de início da locação (cláusula 1.2 do contrato).

ALTER TABLE lanza.contratos
  ADD COLUMN IF NOT EXISTS hora_inicio TEXT NOT NULL DEFAULT '18:00';

COMMENT ON COLUMN lanza.contratos.hora_inicio IS
  'Horário de início/fim da locação (HH:MM) — padrão 18:00.';
