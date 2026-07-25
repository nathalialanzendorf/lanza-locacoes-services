-- Sessões de portais externos (DETRAN, Pedágio, etc.) gravadas via API.

CREATE TABLE IF NOT EXISTS lanza.portal_sessions (
  portal TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_updated
  ON lanza.portal_sessions (updated_at DESC);
