-- Solana Integration Migration
-- Adds columns to batches table for blockchain tracking
BEGIN;

-- Add Solana columns to batches table
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS solana_tx_signature VARCHAR(88),
  ADD COLUMN IF NOT EXISTS solana_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS solana_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS solana_last_error TEXT,
  ADD COLUMN IF NOT EXISTS solana_confirmed_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_batches_solana_status
  ON batches(solana_status);

CREATE INDEX IF NOT EXISTS idx_batches_solana_pending
  ON batches(solana_status, solana_retry_count)
  WHERE solana_status = 'pending';

-- Add comments
COMMENT ON COLUMN batches.solana_tx_signature IS 'Solana transaction signature (88 chars base58)';
COMMENT ON COLUMN batches.solana_status IS 'Status: pending, sent, confirmed, failed, skipped';
COMMENT ON COLUMN batches.solana_retry_count IS 'Number of retry attempts (max 10)';
COMMENT ON COLUMN batches.solana_last_error IS 'Last error message if transaction failed';
COMMENT ON COLUMN batches.solana_confirmed_at IS 'Timestamp when transaction was confirmed on Solana';

COMMIT;

-- Verify changes
\d batches
