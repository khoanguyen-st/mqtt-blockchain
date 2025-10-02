-- Minimal schema is created by the app at startup; this file is for clarity
-- and to aid local inspection. It's safe if the app also runs its own init.

CREATE TABLE IF NOT EXISTS batches (
  batch_id UUID PRIMARY KEY,
  batch_hash TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  message_id UUID PRIMARY KEY,
  batch_id UUID REFERENCES batches(batch_id) ON DELETE CASCADE,
  device_id TEXT,
  topic TEXT,
  message_hash TEXT,
  raw_data JSONB,
  received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  site_id TEXT,
  last_seen TIMESTAMPTZ,
  message_count BIGINT DEFAULT 0
);

