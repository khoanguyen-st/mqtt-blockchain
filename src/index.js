const cfg = require("./config");
const logger = require("./utils/logger");
const { ensureStreamAndGroup } = require("./clients/redis");
const { getPool } = require("./clients/database");
const { initSchema } = require("./services/storage");
const { createMqttClient } = require("./clients/mqtt");
const { BatchProcessor } = require("./services/batchProcessor");
const { createServer } = require("./api/server");
const blockchainService = require("./services/blockchainService");
const blockchainScheduler = require("./services/blockchainScheduler");

async function main() {
  // Ensure downstream services are reachable
  await ensureStreamAndGroup();

  // Init DB schema
  await initSchema();
  logger.info({ msg: "Database schema ready" });

  // Start BlockchainService (if enabled)
  if (cfg.solana.enabled) {
    await blockchainService.start();
    logger.info({
      msg: "BlockchainService started",
      network: cfg.solana.network,
    });

    // Start BlockchainScheduler for scheduled recording every 3 hours
    if (cfg.blockchain.scheduleEnabled) {
      blockchainScheduler.start();
      logger.info({
        msg: "BlockchainScheduler started",
        schedule: "Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)",
        nextRun: blockchainScheduler.getNextRunTime().toISOString(),
      });
    }
  } else {
    logger.info({ msg: "BlockchainService disabled (SOLANA_ENABLED=false)" });
  }

  // Start API
  const { server } = createServer();

  // Start Batch Processor loop
  const processor = new BatchProcessor();
  processor.loop();

  // Start MQTT client
  const mqttClient = createMqttClient();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info({ msg: "Shutting down..." });
    try {
      mqttClient.end(true);
    } catch {}
    if (cfg.solana.enabled) {
      try {
        blockchainScheduler.stop();
        await blockchainService.stop();
      } catch {}
    }
    try {
      await getPool().end();
    } catch {}
    try {
      server.close();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
