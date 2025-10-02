const fs = require('fs');
const path = require('path');
require('dotenv').config();

const cfg = {
  env: process.env.NODE_ENV || 'development',
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
  },
  mqtt: {
    host: process.env.MQTT_HOST || 'mqtt://mosquitto:1883',
    username: process.env.MQTT_USER || undefined,
    password: process.env.MQTT_PASS || undefined,
    topicFilter: process.env.MQTT_TOPIC_FILTER || 'mqtt/things/#',
    clientIdPrefix: process.env.MQTT_CLIENT_PREFIX || 'bridge-service-',
    qos: parseInt(process.env.MQTT_QOS || '1', 10),
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    stream: process.env.REDIS_STREAM || 'mqtt:messages',
    group: process.env.REDIS_GROUP || 'bridge',
    consumer: process.env.REDIS_CONSUMER || `consumer-${Math.random().toString(16).slice(2)}`,
  },
  db: {
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'mqtt',
    user: process.env.POSTGRES_USER || 'mqtt',
    password: process.env.POSTGRES_PASSWORD || 'mqtt',
    ssl: Boolean(process.env.POSTGRES_SSL) || false,
  },
  batching: {
    size: parseInt(process.env.BATCH_SIZE || '1000', 10),
    timeoutMs: parseInt(process.env.BATCH_TIMEOUT_MS || String(5 * 60 * 1000), 10),
  },
};

module.exports = cfg;

