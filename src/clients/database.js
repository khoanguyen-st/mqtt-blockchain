const { Pool } = require('pg');
const cfg = require('../config');
const logger = require('../utils/logger');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: cfg.db.host,
      port: cfg.db.port,
      database: cfg.db.database,
      user: cfg.db.user,
      password: cfg.db.password,
      ssl: cfg.db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    pool.on('error', (err) => logger.error({ msg: 'PG pool error', err: err.message }));
  }
  return pool;
}

module.exports = { getPool };

