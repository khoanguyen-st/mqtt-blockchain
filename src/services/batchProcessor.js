const { randomUUID } = require("crypto");
const cfg = require("../config");
const logger = require("../utils/logger");
const { currentBatchGauge, batchesCompleted } = require("../utils/metrics");
const { readFromStream, ack } = require("../clients/redis");
const { generateMessageHash, generateBatchHash } = require("./hashGenerator");
const { saveBatch } = require("./storage");

class Batch {
  constructor() {
    this.id = randomUUID();
    this.messages = [];
    this.messageHashes = [];
    this.messageCount = 0;
    this.startTimestamp = null;
    this.endTimestamp = null;
  }
  add(message) {
    this.messages.push(message);
    this.messageHashes.push(message.hash);
    this.messageCount = this.messages.length;
    if (!this.startTimestamp)
      this.startTimestamp = new Date(message.receivedAt || Date.now());
    this.endTimestamp = new Date(message.receivedAt || Date.now());
    currentBatchGauge.set(this.messageCount);
  }
}

class BatchProcessor {
  constructor() {
    this.batch = new Batch();
    this.timer = null;
  }

  startTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () =>
        this.completeBatch().catch((e) =>
          logger.error({ msg: "Batch timer error", err: e.message })
        ),
      cfg.batching.timeoutMs
    );
  }

  async handleEntry(streamId, fields) {
    const obj = {};
    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
    const message = {
      id: obj.messageId,
      topic: obj.topic,
      payload: safeParse(obj.payload),
      receivedAt: obj.receivedAt,
      tenantId: obj.tenantId,
      siteId: obj.siteId,
      deviceId: obj.deviceId,
    };

    message.hash = generateMessageHash({
      deviceId: message.deviceId,
      timestamp: message.receivedAt,
      payload: message.payload,
    });

    this.batch.add(message);
    this.startTimer();

    if (this.batch.messageCount >= cfg.batching.size) {
      await this.completeBatch();
    }

    await ack(streamId);
  }

  async completeBatch() {
    if (this.batch.messageCount === 0) return; // nothing to do
    const b = this.batch;
    const batchHash = generateBatchHash(b);
    await saveBatch(b, batchHash);
    batchesCompleted.inc();
    logger.info({ msg: "Batch completed", id: b.id, count: b.messageCount });

    // Note: Blockchain recording is now handled by BlockchainScheduler
    // Batches will be recorded to Solana every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)
    // No immediate blockchain recording here to reduce transaction costs and RPC load

    this.batch = new Batch();
    currentBatchGauge.set(0);
    if (this.timer) clearTimeout(this.timer);
  }

  async loop() {
    // Continuous loop reading from Redis stream
    while (true) {
      try {
        const res = await readFromStream();
        if (!res) continue; // timeout
        for (const [, entries] of res) {
          for (const [id, fields] of entries) {
            await this.handleEntry(id, fields);
          }
        }
      } catch (err) {
        logger.error({ msg: "Batch loop error", err: err.message });
        await sleep(1000);
      }
    }
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return s;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { BatchProcessor };
