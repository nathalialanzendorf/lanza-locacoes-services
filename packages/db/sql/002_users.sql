-- Utilizadores do painel web (login/senha).
-- Executar com: npm run db:migrate

CREATE TABLE IF NOT EXISTS lanza.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON lanza.users (lower(email));

COMMENT ON TABLE lanza.users IS 'Contas de acesso ao painel Lanza Web (não confundir com clientes/locatários).';
