const express = require('express');
const router = express.Router();
const cfg = require('../../config');

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    config: {
      mqttHost: cfg.mqtt.host,
      redisStream: cfg.redis.stream,
      dbHost: cfg.db.host,
    },
  });
});

module.exports = router;

