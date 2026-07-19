-- =============================================================================
-- Lanza Web — utilizador admin (painel)
-- Executar no pgAdmin (Query Tool) ligado ao RDS / PostgreSQL da Lanza.
--
-- Credenciais após executar:
--   E-mail: lanza_admin@lanza.local
--   Senha:  LocaLanza
--
-- Requer: schema lanza e tabela lanza.users (criados abaixo se ainda não existirem).
-- Idempotente: se o e-mail já existir, repõe a senha e o nome.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS lanza;

CREATE TABLE IF NOT EXISTS lanza.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON lanza.users (lower(email));

INSERT INTO lanza.users (id, email, password_hash, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'lanza_admin@lanza.local',
  -- hash scrypt de "LocaLanza" (mesmo algoritmo da API)
  'scrypt$16384$8$1$ce67d1734e399fc65aef1a80574d6ed6$2a04e10b814901407ea85848065bb2df84937ef782e0175ab5ffe30b8704ad8da0ab2320171df02749d240dd30cd3f7acc98a34342becba0c88a01c32b182614',
  'lanza_admin',
  now(),
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  updated_at = now();

-- Confirmar
SELECT id, email, name, created_at, updated_at
FROM lanza.users
WHERE lower(email) = 'lanza_admin@lanza.local';
