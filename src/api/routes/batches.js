const express = require('express');
const router = express.Router();
const { listBatches, getBatch } = require('../../services/storage');

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await listBatches({ limit, offset });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/:batchId', async (req, res, next) => {
  try {
    const row = await getBatch(req.params.batchId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

