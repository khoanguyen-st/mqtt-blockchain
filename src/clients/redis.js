const IORedis = require("ioredis");
const cfg = require("../config");
const logger = require("../utils/logger");

let redis;

function getRedis() {
  if (!redis) {
    redis = new IORedis(cfg.redis.url, { lazyConnect: false });
    redis.on("connect", () =>
      logger.info({ msg: "Redis connected", url: cfg.redis.url })
    );
    redis.on("error", (err) =>
      logger.error({ msg: "Redis error", err: err.message })
    );
  }
  return redis;
}

async function ensureStreamAndGroup() {
  const client = getRedis();
  try {
    // Create group; MKSTREAM creates stream if absent
    await client.xgroup(
      "CREATE",
      cfg.redis.stream,
      cfg.redis.group,
      "$",
      "MKSTREAM"
    );
    logger.info({
      msg: "Redis consumer group ensured",
      stream: cfg.redis.stream,
      group: cfg.redis.group,
    });
  } catch (err) {
    // BUSYGROUP means already exists
    if (!String(err.message).includes("BUSYGROUP")) {
      logger.warn({
        msg: "xgroup create failed (likely exists)",
        err: err.message,
      });
    }
  }
}

async function pushMessageToStream(fields) {
  const client = getRedis();
  const flat = [];
  for (const [k, v] of Object.entries(fields))
    flat.push(k, typeof v === "string" ? v : JSON.stringify(v));
  await client.xadd(cfg.redis.stream, "*", ...flat);
}

async function readFromStream({ count = 100, blockMs = 5000 } = {}) {
  const client = getRedis();
  const res = await client.xreadgroup(
    "GROUP",
    cfg.redis.group,
    cfg.redis.consumer,
    "COUNT",
    count,
    "BLOCK",
    blockMs,
    "STREAMS",
    cfg.redis.stream,
    ">"
  );
  return res;
}

async function ack(streamId) {
  const client = getRedis();
  await client.xack(cfg.redis.stream, cfg.redis.group, streamId);
}

module.exports = {
  getRedis,
  ensureStreamAndGroup,
  pushMessageToStream,
  readFromStream,
  ack,
};
