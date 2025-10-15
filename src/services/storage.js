const { randomUUID } = require("crypto");
const { getPool } = require("../clients/database");

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
    await client.query("BEGIN");

    // Collect unique asset IDs, types, and sites from messages
    const assetIds = [
      ...new Set(batch.messages.map((m) => m.assetId).filter(Boolean)),
    ];
    const assetTypes = [
      ...new Set(batch.messages.map((m) => m.assetType).filter(Boolean)),
    ];
    const siteIds = [
      ...new Set(batch.messages.map((m) => m.siteId).filter(Boolean)),
    ];

    // Calculate location summary (bounding box or centroid)
    const locations = batch.messages
      .map((m) => m.location)
      .filter((loc) => loc && loc.coordinates);

    const locationSummary =
      locations.length > 0
        ? {
            type: "summary",
            deviceCount: locations.length,
            boundingBox: calculateBoundingBox(locations),
            centroid: calculateCentroid(locations),
          }
        : null;

    await client.query(
      `INSERT INTO batches (
        batch_id, batch_hash, message_count, 
        start_timestamp, end_timestamp, status,
        asset_ids, asset_types, site_ids, location_summary
      )
       VALUES ($1, $2, $3, $4, $5, 'complete', $6, $7, $8, $9)`,
      [
        batch.id,
        batchHash,
        batch.messageCount,
        batch.startTimestamp,
        batch.endTimestamp,
        assetIds.length > 0 ? assetIds : null,
        assetTypes.length > 0 ? assetTypes : null,
        siteIds.length > 0 ? siteIds : null,
        locationSummary ? JSON.stringify(locationSummary) : null,
      ]
    );

    for (const message of batch.messages) {
      await client.query(
        `INSERT INTO messages (
          message_id, batch_id, device_id, topic, message_hash, raw_data, received_at,
          asset_id, device_eui, device_location, signal_quality, gateway_info
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          message.id || randomUUID(),
          batch.id,
          message.deviceId,
          message.topic,
          message.hash,
          message.payload,
          message.receivedAt,
          message.assetId || null,
          message.deviceEUI || null,
          message.location ? JSON.stringify(message.location) : null,
          message.signalQuality ? JSON.stringify(message.signalQuality) : null,
          message.gatewayInfo ? JSON.stringify(message.gatewayInfo) : null,
        ]
      );
      await client.query(
        `INSERT INTO devices (device_id, tenant_id, site_id, last_seen, message_count)
         VALUES ($1, $2, $3, NOW(), 1)
         ON CONFLICT (device_id) DO UPDATE SET last_seen = NOW(), message_count = devices.message_count + 1`,
        [message.deviceId, message.tenantId, message.siteId]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Calculate bounding box from array of locations
 */
function calculateBoundingBox(locations) {
  if (locations.length === 0) return null;

  const lons = locations.map((l) => l.coordinates[0]);
  const lats = locations.map((l) => l.coordinates[1]);

  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

/**
 * Calculate centroid from array of locations
 */
function calculateCentroid(locations) {
  if (locations.length === 0) return null;

  const lons = locations.map((l) => l.coordinates[0]);
  const lats = locations.map((l) => l.coordinates[1]);

  return {
    type: "Point",
    coordinates: [
      lons.reduce((a, b) => a + b, 0) / lons.length,
      lats.reduce((a, b) => a + b, 0) / lats.length,
    ],
  };
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
  const { rows } = await pool.query(
    `SELECT * FROM batches WHERE batch_id = $1`,
    [batchId]
  );
  return rows[0] || null;
}

async function getMessage(messageId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE message_id = $1`,
    [messageId]
  );
  return rows[0] || null;
}

module.exports = { initSchema, saveBatch, listBatches, getBatch, getMessage };
