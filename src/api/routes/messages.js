const express = require('express');
const router = express.Router();
const { getMessage } = require('../../services/storage');

router.get('/:messageId', async (req, res, next) => {
  try {
    const row = await getMessage(req.params.messageId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

module.exports = router;

