const crypto = require('crypto');

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj)
    .sort()
    .reduce((acc, k) => {
      acc[k] = sortKeys(obj[k]);
      return acc;
    }, {});
}

function generateMessageHash(message) {
  const sortedPayload = sortKeys(message.payload);
  const input = [
    message.deviceId,
    String(message.timestamp || message.receivedAt || ''),
    JSON.stringify(sortedPayload),
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex');
}

function generateBatchHash(batch) {
  const messagesHash = crypto
    .createHash('sha256')
    .update(batch.messageHashes.join(''))
    .digest('hex');

  const input = [
    batch.id,
    String(batch.messageCount),
    batch.startTimestamp.toISOString(),
    batch.endTimestamp.toISOString(),
    messagesHash,
  ].join('|');

  return crypto.createHash('sha256').update(input).digest('hex');
}

module.exports = { generateMessageHash, generateBatchHash };

