const mqtt = require("mqtt");
const { randomUUID } = require("crypto");
const cfg = require("../config");
const logger = require("../utils/logger");
const {
  mqttMessagesReceived,
  mqttMessagesProcessed,
} = require("../utils/metrics");
const { pushMessageToStream } = require("./redis");

function createMqttClient() {
  const clientId = `${cfg.mqtt.clientIdPrefix}${Math.random()
    .toString(16)
    .slice(2)}`;
  const client = mqtt.connect(cfg.mqtt.host, {
    clientId,
    username: cfg.mqtt.username,
    password: cfg.mqtt.password,
    clean: false,
    reconnectPeriod: 5000,
    keepalive: 60,
    connectTimeout: 30000,
  });

  client.on("connect", () => {
    logger.info({ msg: "MQTT connected", host: cfg.mqtt.host, clientId });
    client.subscribe(cfg.mqtt.topicFilter, { qos: cfg.mqtt.qos }, (err) => {
      if (err)
        logger.error({
          msg: "MQTT subscribe error",
          err: err.message,
          topic: cfg.mqtt.topicFilter,
        });
      else logger.info({ msg: "MQTT subscribed", topic: cfg.mqtt.topicFilter });
    });
  });

  client.on("error", (err) =>
    logger.error({ msg: "MQTT error", err: err.message })
  );
  client.on("close", () => logger.warn({ msg: "MQTT connection closed" }));

  client.on("message", async (topic, payloadBuf) => {
    mqttMessagesReceived.inc();
    const receivedAt = new Date().toISOString();

    // Add debug logging
    logger.info({
      msg: "MQTT message received",
      topic,
      payloadSize: payloadBuf.length,
    });

    let payload;
    try {
      payload = JSON.parse(payloadBuf.toString());
      logger.debug({
        msg: "Payload parsed successfully",
        hasDevEUI: !!payload?.DevEUI_location?.DevEUI,
      });
    } catch (e) {
      logger.warn({
        msg: "Non-JSON payload ignored",
        topic,
        payload: payloadBuf.toString(),
      });
      return;
    }

    // Extract IDs from topic heuristically: a/b/c/d -> tenant/site/device
    const parts = topic.split("/");
    const tenantId = parts[0] || "unknown";
    const siteId = parts[1] || "unknown";
    const deviceId = payload?.DevEUI_location?.DevEUI || parts[2] || "unknown";

    logger.debug({
      msg: "Extracted IDs",
      tenantId,
      siteId,
      deviceId,
      topicParts: parts,
    });

    const messageId = randomUUID();
    try {
      await pushMessageToStream({
        messageId,
        topic,
        payload,
        receivedAt,
        tenantId,
        siteId,
        deviceId,
      });
      mqttMessagesProcessed.inc();
      logger.info({
        msg: "Message pushed to Redis stream successfully",
        messageId,
      });
    } catch (err) {
      logger.error({
        msg: "Failed to push to Redis stream",
        err: err.message,
        messageId,
      });
    }
  });

  return client;
}

module.exports = { createMqttClient };
