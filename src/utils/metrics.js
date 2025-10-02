const client = require("prom-client");

client.collectDefaultMetrics();

const mqttMessagesReceived = new client.Counter({
  name: "mqtt_messages_received_total",
  help: "Total MQTT messages received",
});

const mqttMessagesProcessed = new client.Counter({
  name: "mqtt_messages_processed_total",
  help: "Total MQTT messages pushed to queue",
});

const batchesCompleted = new client.Counter({
  name: "batches_completed_total",
  help: "Total completed batches",
});

const currentBatchGauge = new client.Gauge({
  name: "current_batch_message_count",
  help: "Current in-memory batch message count",
});

module.exports = {
  register: client.register,
  mqttMessagesReceived,
  mqttMessagesProcessed,
  batchesCompleted,
  currentBatchGauge,
};
