-- Jobs de sync assíncronos (status visível na UI; persiste entre instâncias Vercel).

CREATE TABLE IF NOT EXISTS lanza.sync_jobs (
  id UUID PRIMARY KEY,
  sync TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  input JSONB,
  result JSONB,
  error TEXT,
  progress JSONB
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_created
  ON lanza.sync_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_sync_created
  ON lanza.sync_jobs (sync, created_at DESC);
