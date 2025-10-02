# Data Model Design Document - MQTT Bridge Service PoC

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Scope:** Local Proof of Concept

---

## 1. Overview

### 1.1 Purpose

Define the database schema and data structures for storing MQTT messages, batches, and related metadata.

### 1.2 Database Technology

- **RDBMS:** PostgreSQL 15+
- **ORM:** None (raw SQL for PoC simplicity)
- **Driver:** node-postgres (pg)

---

## 2. Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────┐
│    devices      │         │    batches      │
├─────────────────┤         ├─────────────────┤
│ device_id (PK)  │         │ batch_id (PK)   │
│ tenant_id       │    ┌────│ batch_hash      │
│ site_id         │    │    │ message_count   │
│ last_seen       │    │    │ start_timestamp │
│ message_count   │    │    │ end_timestamp   │
│ public_key      │    │    │ solana_tx_sig   │
│ created_at      │    │    │ status          │
└─────────────────┘    │    │ created_at      │
                       │    └─────────────────┘
                       │             │
                       │             │ 1:N
                       │             │
                       │    ┌────────▼────────┐
                       │    │    messages     │
                       │    ├─────────────────┤
                       │    │ message_id (PK) │
                       └────│ batch_id (FK)   │
                            │ device_id (FK)  │
                            │ topic           │
                            │ message_hash    │
                            │ raw_data (JSON) │
                            │ received_at     │
                            │ processed_at    │
                            └─────────────────┘
```

---

## 3. Table Definitions

### 3.1 Table: `batches`

**Purpose:** Store batch metadata and hashes for blockchain verification

```sql
CREATE TABLE batches (
    batch_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_hash          VARCHAR(64) NOT NULL,
    message_count       INTEGER NOT NULL CHECK (message_count > 0),
    start_timestamp     TIMESTAMP WITH TIME ZONE NOT NULL,
    end_timestamp       TIMESTAMP WITH TIME ZONE NOT NULL,
    solana_tx_signature VARCHAR(88),  -- Null for PoC, will be populated later
    solana_block_number BIGINT,       -- Null for PoC
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at        TIMESTAMP WITH TIME ZONE,

    CONSTRAINT check_timestamps CHECK (end_timestamp >= start_timestamp),
    CONSTRAINT check_status CHECK (status IN ('pending', 'hashing', 'complete', 'failed', 'blockchain_pending', 'blockchain_confirmed'))
);

-- Indexes for common queries
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_created_at ON batches(created_at DESC);
CREATE INDEX idx_batches_hash ON batches(batch_hash);
```

**Column Details:**

| Column              | Type        | Nullable | Description                                                |
| ------------------- | ----------- | -------- | ---------------------------------------------------------- |
| batch_id            | UUID        | No       | Unique identifier for the batch                            |
| batch_hash          | VARCHAR(64) | No       | SHA-256 hash of the entire batch (32 bytes = 64 hex chars) |
| message_count       | INTEGER     | No       | Number of messages in this batch                           |
| start_timestamp     | TIMESTAMPTZ | No       | Timestamp of the first message in batch                    |
| end_timestamp       | TIMESTAMPTZ | No       | Timestamp of the last message in batch                     |
| solana_tx_signature | VARCHAR(88) | Yes      | Solana transaction signature (base58, ~87-88 chars)        |
| solana_block_number | BIGINT      | Yes      | Block number where transaction was confirmed               |
| status              | VARCHAR(20) | No       | Current status of the batch                                |
| created_at          | TIMESTAMPTZ | No       | When the batch record was created                          |
| confirmed_at        | TIMESTAMPTZ | Yes      | When blockchain confirmation received                      |

**Status Values:**

- `pending`: Batch is being accumulated
- `hashing`: Hash generation in progress
- `complete`: Hash generated, stored in DB (PoC end state)
- `failed`: Error occurred during processing
- `blockchain_pending`: Sent to Solana, awaiting confirmation (future)
- `blockchain_confirmed`: Confirmed on Solana (future)

---

### 3.2 Table: `messages`

**Purpose:** Store individual message metadata and raw data

```sql
CREATE TABLE messages (
    message_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID REFERENCES batches(batch_id) ON DELETE CASCADE,
    device_id    VARCHAR(100) NOT NULL,
    topic        VARCHAR(255) NOT NULL,
    message_hash VARCHAR(64) NOT NULL,
    raw_data     JSONB NOT NULL,  -- Stores the full message payload
    received_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_batch FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
    CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Indexes for common queries
CREATE INDEX idx_messages_batch_id ON messages(batch_id);
CREATE INDEX idx_messages_device_id ON messages(device_id);
CREATE INDEX idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX idx_messages_hash ON messages(message_hash);

-- GIN index for JSONB queries
CREATE INDEX idx_messages_raw_data ON messages USING GIN (raw_data);
```

**Column Details:**

| Column       | Type         | Nullable | Description                                                              |
| ------------ | ------------ | -------- | ------------------------------------------------------------------------ |
| message_id   | UUID         | No       | Unique identifier for the message                                        |
| batch_id     | UUID         | Yes      | Reference to the batch this message belongs to (null while accumulating) |
| device_id    | VARCHAR(100) | No       | Device identifier extracted from topic                                   |
| topic        | VARCHAR(255) | No       | Full MQTT topic path                                                     |
| message_hash | VARCHAR(64)  | No       | SHA-256 hash of this individual message                                  |
| raw_data     | JSONB        | No       | Full message payload in JSON format                                      |
| received_at  | TIMESTAMPTZ  | No       | When message was received from MQTT broker                               |
| processed_at | TIMESTAMPTZ  | No       | When message was written to database                                     |

**JSONB Structure (raw_data):**

```json
{
  "deviceId": "SENSOR_001",
  "timestamp": 1678886400,
  "kwh": 15.7,
  "voltage": 220.1,
  "current": 71.36,
  "temperature": 32.5,
  "metadata": {
    "firmware_version": "2.1.0",
    "signal_strength": -45
  }
}
```

---

### 3.3 Table: `devices`

**Purpose:** Track active devices and their metadata

```sql
CREATE TABLE devices (
    device_id     VARCHAR(100) PRIMARY KEY,
    tenant_id     VARCHAR(100) NOT NULL,
    site_id       VARCHAR(100) NOT NULL,
    last_seen     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message_count BIGINT DEFAULT 0,
    public_key    VARCHAR(88),  -- For device signature verification (future)
    firmware_version VARCHAR(50),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_devices_tenant_site ON devices(tenant_id, site_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);
```

**Column Details:**

| Column           | Type         | Nullable | Description                                             |
| ---------------- | ------------ | -------- | ------------------------------------------------------- |
| device_id        | VARCHAR(100) | No       | Unique device identifier (e.g., SENSOR_001)             |
| tenant_id        | VARCHAR(100) | No       | Customer/factory identifier                             |
| site_id          | VARCHAR(100) | No       | Location/production line identifier                     |
| last_seen        | TIMESTAMPTZ  | No       | Last time a message was received from this device       |
| message_count    | BIGINT       | No       | Total messages received from this device                |
| public_key       | VARCHAR(88)  | Yes      | Device's public key for signature verification (future) |
| firmware_version | VARCHAR(50)  | Yes      | Last known firmware version                             |
| created_at       | TIMESTAMPTZ  | No       | When device first appeared                              |
| updated_at       | TIMESTAMPTZ  | No       | Last update to this record                              |

---

## 4. Sample Data

### 4.1 Sample Batch

```sql
INSERT INTO batches (
    batch_id,
    batch_hash,
    message_count,
    start_timestamp,
    end_timestamp,
    status
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1',
    1000,
    '2025-10-01 10:00:00+00',
    '2025-10-01 10:05:00+00',
    'complete'
);
```

### 4.2 Sample Message

```sql
INSERT INTO messages (
    message_id,
    batch_id,
    device_id,
    topic,
    message_hash,
    raw_data,
    received_at
) VALUES (
    '660e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    'SENSOR_001',
    'veep/factory1/line2/SENSOR_001/data',
    'b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
    '{
        "deviceId": "SENSOR_001",
        "timestamp": 1696156800,
        "kwh": 15.7,
        "voltage": 220.1,
        "current": 71.36
    }',
    '2025-10-01 10:00:00+00'
);
```

### 4.3 Sample Device

```sql
INSERT INTO devices (
    device_id,
    tenant_id,
    site_id,
    last_seen,
    message_count
) VALUES (
    'SENSOR_001',
    'factory1',
    'line2',
    NOW(),
    1524
);
```

---

## 5. Common Queries

### 5.1 Get Batch Details

```sql
SELECT
    b.batch_id,
    b.batch_hash,
    b.message_count,
    b.start_timestamp,
    b.end_timestamp,
    b.status,
    COUNT(m.message_id) as actual_message_count
FROM batches b
LEFT JOIN messages m ON b.batch_id = m.batch_id
WHERE b.batch_id = $1
GROUP BY b.batch_id;
```

### 5.2 Get Messages in Batch

```sql
SELECT
    m.message_id,
    m.device_id,
    m.topic,
    m.message_hash,
    m.raw_data,
    m.received_at
FROM messages m
WHERE m.batch_id = $1
ORDER BY m.received_at ASC
LIMIT 100 OFFSET 0;
```

### 5.3 Verify Message in Batch

```sql
SELECT
    m.message_id,
    m.message_hash,
    b.batch_id,
    b.batch_hash,
    b.status
FROM messages m
JOIN batches b ON m.batch_id = b.batch_id
WHERE m.message_id = $1;
```

### 5.4 Get Device Statistics

```sql
SELECT
    d.device_id,
    d.tenant_id,
    d.site_id,
    d.message_count,
    d.last_seen,
    COUNT(m.message_id) as messages_last_24h
FROM devices d
LEFT JOIN messages m ON d.device_id = m.device_id
    AND m.received_at > NOW() - INTERVAL '24 hours'
WHERE d.tenant_id = $1
GROUP BY d.device_id, d.tenant_id, d.site_id, d.message_count, d.last_seen
ORDER BY d.last_seen DESC;
```

### 5.5 Search Messages by Device and Time Range

```sql
SELECT
    m.message_id,
    m.batch_id,
    m.message_hash,
    m.raw_data,
    m.received_at
FROM messages m
WHERE m.device_id = $1
    AND m.received_at >= $2
    AND m.received_at <= $3
ORDER BY m.received_at DESC
LIMIT 100;
```

### 5.6 Get Recent Batches

```sql
SELECT
    batch_id,
    batch_hash,
    message_count,
    start_timestamp,
    end_timestamp,
    status,
    created_at
FROM batches
ORDER BY created_at DESC
LIMIT 20;
```

### 5.7 Get Pending Batches (for monitoring)

```sql
SELECT
    batch_id,
    message_count,
    start_timestamp,
    NOW() - start_timestamp as age
FROM batches
WHERE status = 'pending'
ORDER BY start_timestamp ASC;
```

---

## 6. Constraints & Validations

### 6.1 Data Integrity Rules

1. **Referential Integrity:**

   - Every message must reference a valid device
   - Every message in a complete batch must reference that batch
   - Deleting a batch cascades to delete its messages

2. **Business Rules:**

   - Batch message_count must be > 0
   - Batch end_timestamp must be >= start_timestamp
   - Batch status must be one of the defined values
   - Message device_id must match the format extracted from topic

3. **Uniqueness:**
   - batch_id is unique (primary key)
   - message_id is unique (primary key)
   - device_id is unique (primary key)
   - batch_hash should be unique in practice (not enforced by constraint)

---

## 7. Performance Considerations

### 7.1 Expected Data Volume (PoC)

Assumptions:

- 100 messages/second average
- Each message ~500 bytes raw JSON
- 10 devices
- 1 week retention for testing

**Calculations:**

```
Messages per day:   100 msg/s × 86,400 s = 8,640,000 messages/day
Batches per day:    8,640 batches (assuming 1000 msg/batch)
Storage per day:    8.64M × 500 bytes ≈ 4.2 GB/day
Storage per week:   4.2 GB × 7 ≈ 30 GB
```

**Table Sizes (1 week):**

- `messages`: ~60M rows, ~30 GB
- `batches`: ~60K rows, ~50 MB
- `devices`: ~10 rows, negligible

### 7.2 Index Strategy

**Indexes are critical for:**

1. **Batch lookups by ID** → Primary key (automatic)
2. **Batch status queries** → `idx_batches_status`
3. **Recent batches** → `idx_batches_created_at`
4. **Message → Batch relationship** → `idx_messages_batch_id`
5. **Device messages** → `idx_messages_device_id`
6. **Time-range queries** → `idx_messages_received_at`
7. **JSONB queries** → `idx_messages_raw_data` (GIN)

### 7.3 Query Optimization

**Best Practices:**

- Always use prepared statements (`$1`, `$2`, etc.)
- Use `LIMIT` for paginated queries
- Use covering indexes where possible
- Monitor slow query log (queries > 100ms)

**PostgreSQL Configuration (for PoC):**

```
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1  # SSD
effective_io_concurrency = 200
```

---

## 8. Data Lifecycle Management

### 8.1 Retention Policy (PoC)

**For PoC:**

- Keep all data (no automated cleanup)
- Manual cleanup for testing

**For Production (Future):**

```sql
-- Archive old batches (> 90 days) to cold storage
-- Delete messages older than 1 year after archival

CREATE OR REPLACE FUNCTION archive_old_batches()
RETURNS void AS $$
BEGIN
    -- Move to archive table or S3
    -- Implementation depends on archival strategy
END;
$$ LANGUAGE plpgsql;
```

### 8.2 Backup Strategy (PoC)

**For PoC:**

- Manual `pg_dump` before major changes
- No automated backups

**For Production (Future):**

- Daily full backups
- WAL archiving for point-in-time recovery
- Test restore procedures monthly

---

## 9. Data Migration Scripts

### 9.1 Initial Schema Setup

**File: `scripts/001_initial_schema.sql`**

```sql
-- Create database
CREATE DATABASE veep_bridge;

-- Connect to database
\c veep_bridge

-- Create tables
CREATE TABLE devices ( /* as defined above */ );
CREATE TABLE batches ( /* as defined above */ );
CREATE TABLE messages ( /* as defined above */ );

-- Create indexes
CREATE INDEX /* as defined above */;

-- Create functions (if any)
-- Create triggers (if any)
```

### 9.2 Seed Data for Testing

**File: `scripts/002_seed_data.sql`**

```sql
-- Insert test devices
INSERT INTO devices (device_id, tenant_id, site_id) VALUES
    ('SENSOR_001', 'factory1', 'line1'),
    ('SENSOR_002', 'factory1', 'line1'),
    ('SENSOR_003', 'factory1', 'line2');

-- Don't seed batches/messages (will be created by Bridge Service)
```

---

## 10. Future Schema Changes

### 10.1 Planned Additions (Post-PoC)

**For Solana Integration:**

```sql
-- Add columns to batches table
ALTER TABLE batches
    ADD COLUMN solana_confirmed BOOLEAN DEFAULT FALSE,
    ADD COLUMN solana_confirmation_time TIMESTAMP WITH TIME ZONE;

-- Add transaction log table
CREATE TABLE blockchain_transactions (
    tx_id UUID PRIMARY KEY,
    batch_id UUID REFERENCES batches(batch_id),
    tx_signature VARCHAR(88) NOT NULL,
    block_number BIGINT,
    status VARCHAR(20),
    gas_fee NUMERIC(20,9),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**For Device Signatures:**

```sql
-- Add signature field to messages
ALTER TABLE messages
    ADD COLUMN device_signature VARCHAR(88);

-- Add signature verification log
CREATE TABLE signature_verifications (
    verification_id UUID PRIMARY KEY,
    message_id UUID REFERENCES messages(message_id),
    is_valid BOOLEAN NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 11. Database Connection Configuration

### 11.1 Connection Pool Settings

```javascript
// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DATABASE_HOST || "localhost",
  port: process.env.DATABASE_PORT || 5432,
  database: process.env.DATABASE_NAME || "veep_bridge",
  user: process.env.DATABASE_USER || "bridge",
  password: process.env.DATABASE_PASSWORD,
  max: 10, // Maximum connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## Document Approval

| Role              | Name        | Date    | Status |
| ----------------- | ----------- | ------- | ------ |
| Database Designer | [Your Name] | 2025-10 | Draft  |
| Reviewer          | TBD         | -       | -      |

---

**Next Document:** API Specification
