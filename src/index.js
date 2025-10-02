const cfg = require('./config');
const logger = require('./utils/logger');
const { ensureStreamAndGroup } = require('./clients/redis');
const { getPool } = require('./clients/database');
const { initSchema } = require('./services/storage');
const { createMqttClient } = require('./clients/mqtt');
const { BatchProcessor } = require('./services/batchProcessor');
const { createServer } = require('./api/server');

async function main() {
  // Ensure downstream services are reachable
  await ensureStreamAndGroup();

  // Init DB schema
  await initSchema();
  logger.info({ msg: 'Database schema ready' });

  // Start API
  const { server } = createServer();

  // Start Batch Processor loop
  const processor = new BatchProcessor();
  processor.loop();

  // Start MQTT client
  const mqttClient = createMqttClient();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info({ msg: 'Shutting down...' });
    try { mqttClient.end(true); } catch {}
    try { await getPool().end(); } catch {}
    try { server.close(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

