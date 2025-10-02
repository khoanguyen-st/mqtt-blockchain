const { randomUUID } = require('crypto');
const { getPool } = require('../clients/database');

async function initSchema() {
  const pool = getPool();
  await pool.query(`
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
  `);
}

async function saveBatch(batch, batchHash) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO batches (batch_id, batch_hash, message_count, start_timestamp, end_timestamp, status)
       VALUES ($1, $2, $3, $4, $5, 'complete')`,
      [batch.id, batchHash, batch.messageCount, batch.startTimestamp, batch.endTimestamp]
    );

    for (const message of batch.messages) {
      await client.query(
        `INSERT INTO messages (message_id, batch_id, device_id, topic, message_hash, raw_data, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          message.id || randomUUID(),
          batch.id,
          message.deviceId,
          message.topic,
          message.hash,
          message.payload,
          message.receivedAt,
        ]
      );
      await client.query(
        `INSERT INTO devices (device_id, tenant_id, site_id, last_seen, message_count)
         VALUES ($1, $2, $3, NOW(), 1)
         ON CONFLICT (device_id) DO UPDATE SET last_seen = NOW(), message_count = devices.message_count + 1`,
        [message.deviceId, message.tenantId, message.siteId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listBatches({ limit = 20, offset = 0 } = {}) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM batches ORDER BY end_timestamp DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getBatch(batchId) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM batches WHERE batch_id = $1`, [batchId]);
  return rows[0] || null;
}

async function getMessage(messageId) {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT * FROM messages WHERE message_id = $1`, [messageId]);
  return rows[0] || null;
}

module.exports = { initSchema, saveBatch, listBatches, getBatch, getMessage };

