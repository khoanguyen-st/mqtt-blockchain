function parse(topic, payload) {
  // Basic validation: payload should be an object
  if (!payload || typeof payload !== 'object') return null;

  const parts = topic.split('/');
  const tenantId = parts[0] || 'unknown';
  const siteId = parts[1] || 'unknown';
  const deviceId = payload?.DevEUI_location?.DevEUI || parts[2] || 'unknown';

  return {
    tenantId,
    siteId,
    deviceId,
    payload,
  };
}

module.exports = { parse };

