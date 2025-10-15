-- Layer 1: Asset Identity & Provenance Enhancement
-- Adds comprehensive asset metadata for digital asset compliance

BEGIN;

-- =========================================
-- 1. ASSET METADATA TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS asset_metadata (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Device Identity (Critical)
  device_eui VARCHAR(16) UNIQUE NOT NULL,  -- LoRaWAN DevEUI (e.g., 24E124468E392493)
  device_name TEXT,                         -- e.g., "UC100-Nedspice No.13"
  device_type VARCHAR(100),                 -- e.g., "UC100", "CHILLER", "METER"
  
  -- Asset Classification
  asset_type VARCHAR(50),                   -- e.g., "ENERGY_METER", "SENSOR", "EQUIPMENT"
  manufacturer VARCHAR(100),                -- e.g., "MILE"
  model VARCHAR(100),                       -- e.g., "UC100-Elite440"
  product_id VARCHAR(100),                  -- e.g., "msight/uc100"
  firmware_version VARCHAR(50),             -- e.g., "1"
  
  -- Physical Location (High Priority)
  physical_location JSONB,                  -- GPS, address, geohash
  site_id TEXT,                             -- e.g., "Nedspice"
  site_name TEXT,                           -- e.g., "VEEP/Vietnam/Nedspice"
  
  -- Ownership & Provenance (Critical)
  owner_tenant_id TEXT,                     -- e.g., "VEEP"
  customer_id VARCHAR(50),                  -- e.g., "1100012639"
  issuer_wallet VARCHAR(88),                -- Solana wallet address
  
  -- Equipment Specifications
  specifications JSONB,                     -- Capacity, power, etc.
  
  -- Lifecycle Management
  lifecycle_status VARCHAR(50) DEFAULT 'active',  -- active, maintenance, decommissioned
  commissioned_at TIMESTAMPTZ,
  decommissioned_at TIMESTAMPTZ,
  
  -- Tags & Categories
  tags TEXT[],                              -- e.g., ["Nedspice", "Energy"]
  domains TEXT[],                           -- e.g., ["VEEP/Vietnam/Nedspice"]
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_asset_device_eui ON asset_metadata(device_eui);
CREATE INDEX IF NOT EXISTS idx_asset_type ON asset_metadata(asset_type);
CREATE INDEX IF NOT EXISTS idx_asset_lifecycle ON asset_metadata(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_asset_site ON asset_metadata(site_id);
CREATE INDEX IF NOT EXISTS idx_asset_customer ON asset_metadata(customer_id);

-- Comments
COMMENT ON TABLE asset_metadata IS 'Layer 1: Asset Identity & Provenance - Complete asset metadata for digital asset compliance';
COMMENT ON COLUMN asset_metadata.device_eui IS 'LoRaWAN DevEUI - Unique device identifier (16 hex chars)';
COMMENT ON COLUMN asset_metadata.physical_location IS 'GPS coordinates, address, geohash for spatial mapping';
COMMENT ON COLUMN asset_metadata.issuer_wallet IS 'Solana wallet address of asset issuer/owner';
COMMENT ON COLUMN asset_metadata.lifecycle_status IS 'Asset lifecycle: active, maintenance, decommissioned, retired';

-- =========================================
-- 2. ENHANCE MESSAGES TABLE
-- =========================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES asset_metadata(asset_id),
  ADD COLUMN IF NOT EXISTS device_eui VARCHAR(16),
  ADD COLUMN IF NOT EXISTS device_location JSONB,     -- GPS from message
  ADD COLUMN IF NOT EXISTS signal_quality JSONB,      -- RSSI, SNR, etc.
  ADD COLUMN IF NOT EXISTS gateway_info JSONB;        -- Gateway/LRR data

CREATE INDEX IF NOT EXISTS idx_messages_asset_id ON messages(asset_id);
CREATE INDEX IF NOT EXISTS idx_messages_device_eui ON messages(device_eui);

COMMENT ON COLUMN messages.asset_id IS 'Reference to asset_metadata for complete asset info';
COMMENT ON COLUMN messages.device_eui IS 'LoRaWAN DevEUI from payload';
COMMENT ON COLUMN messages.device_location IS 'GPS coordinates from message (DevLAT, DevLON, DevAlt)';
COMMENT ON COLUMN messages.signal_quality IS 'LoRaWAN signal metrics (RSSI, SNR, ESP)';

-- =========================================
-- 3. ENHANCE BATCHES TABLE  
-- =========================================
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS asset_ids UUID[],          -- Array of asset IDs in batch
  ADD COLUMN IF NOT EXISTS asset_types TEXT[],        -- Array of asset types
  ADD COLUMN IF NOT EXISTS site_ids TEXT[],           -- Sites involved
  ADD COLUMN IF NOT EXISTS location_summary JSONB;    -- Geographic summary

CREATE INDEX IF NOT EXISTS idx_batches_asset_ids ON batches USING GIN(asset_ids);
CREATE INDEX IF NOT EXISTS idx_batches_site_ids ON batches USING GIN(site_ids);

COMMENT ON COLUMN batches.asset_ids IS 'Array of unique asset IDs included in this batch';
COMMENT ON COLUMN batches.location_summary IS 'Geographic bounding box or centroid of assets in batch';

-- =========================================
-- 4. ASSET HISTORY TABLE (Audit Trail)
-- =========================================
CREATE TABLE IF NOT EXISTS asset_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES asset_metadata(asset_id) ON DELETE CASCADE,
  
  -- Change tracking
  change_type VARCHAR(50) NOT NULL,         -- created, updated, transferred, decommissioned
  changed_fields JSONB,                     -- What changed
  previous_values JSONB,                    -- Old values
  new_values JSONB,                         -- New values
  
  -- Provenance
  changed_by VARCHAR(255),                  -- User/system that made change
  blockchain_tx VARCHAR(88),                -- Optional: Solana tx if recorded
  
  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_history_type ON asset_history(change_type);

COMMENT ON TABLE asset_history IS 'Audit trail for asset provenance and lifecycle changes';

-- =========================================
-- 5. FUNCTION: Auto-update updated_at
-- =========================================
CREATE OR REPLACE FUNCTION update_asset_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_asset_updated_at
  BEFORE UPDATE ON asset_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_asset_updated_at();

-- =========================================
-- 6. FUNCTION: Track asset changes
-- =========================================
CREATE OR REPLACE FUNCTION track_asset_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO asset_history (asset_id, change_type, new_values)
    VALUES (NEW.asset_id, 'created', row_to_json(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO asset_history (asset_id, change_type, previous_values, new_values)
    VALUES (
      NEW.asset_id, 
      'updated', 
      row_to_json(OLD), 
      row_to_json(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO asset_history (asset_id, change_type, previous_values)
    VALUES (OLD.asset_id, 'deleted', row_to_json(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_asset_changes
  AFTER INSERT OR UPDATE OR DELETE ON asset_metadata
  FOR EACH ROW
  EXECUTE FUNCTION track_asset_changes();

COMMIT;

-- =========================================
-- VERIFICATION
-- =========================================
\echo 'Layer 1 schema enhancement completed successfully!'
\echo 'Tables created: asset_metadata, asset_history'
\echo 'Enhanced tables: messages, batches'
\echo 'Run: SELECT * FROM asset_metadata LIMIT 1; to verify'
