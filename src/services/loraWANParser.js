/**
 * LoRaWAN Message Parser
 * Parses Actility ThingPark LoRaWAN uplink messages
 * Extracts asset metadata for Layer 1 compliance
 */

/**
 * Parse LoRaWAN uplink message from Actility ThingPark
 * @param {Object} payload - Full MQTT payload
 * @returns {Object} Parsed message with asset metadata
 */
function parseLoRaWANUplink(payload) {
  // Check if this is a DevEUI_uplink message
  const uplink = payload.DevEUI_uplink;
  if (!uplink) {
    return null;
  }

  // Extract device identity
  const deviceEUI = uplink.DevEUI;
  const deviceName = uplink.CustomerData?.name || "Unknown";

  // Extract location data
  const location = extractLocation(uplink);

  // Extract asset metadata
  const assetMetadata = extractAssetMetadata(uplink);

  // Extract signal quality
  const signalQuality = extractSignalQuality(uplink);

  // Extract gateway information
  const gatewayInfo = extractGatewayInfo(uplink);

  // Parse actual sensor payload
  const sensorData = uplink.payload || {};

  return {
    // Device Identity (Critical for Layer 1)
    deviceEUI,
    deviceName,
    deviceAddr: uplink.DevAddr,

    // Asset Metadata
    assetMetadata,

    // Location (High Priority)
    location,

    // Signal Quality (for IoT verification)
    signalQuality,

    // Gateway Info
    gatewayInfo,

    // Sensor Data (actual measurements)
    sensorData,

    // Timing
    timestamp: new Date(uplink.Time),
    deviceTime: uplink.DevLocTime ? new Date(uplink.DevLocTime) : null,

    // LoRaWAN Protocol Info
    protocol: {
      fPort: uplink.FPort,
      fCntUp: uplink.FCntUp,
      fCntDn: uplink.FCntDn,
      adr: uplink.ADRbit === 1,
      mType: uplink.MType,
      spreadFactor: uplink.SpFact,
      frequency: uplink.Frequency,
      txPower: uplink.TxPower,
      nbTrans: uplink.NbTrans,
      dynamicClass: uplink.DynamicClass,
    },

    // Raw data for verification
    payloadHex: uplink.payload_hex,
    micHex: uplink.mic_hex,
  };
}

/**
 * Extract physical location from uplink
 */
function extractLocation(uplink) {
  if (!uplink.DevLAT || !uplink.DevLON) {
    return null;
  }

  return {
    type: "Point",
    coordinates: [uplink.DevLON, uplink.DevLAT], // [longitude, latitude] - GeoJSON format
    altitude: uplink.DevAlt || 0,
    accuracy: uplink.DevLocRadius || null,
    altitudeAccuracy: uplink.DevAltRadius || null,
    timestamp: uplink.DevLocTime ? new Date(uplink.DevLocTime) : null,
    source: "LoRaWAN_Geolocation",
    algorithm: uplink.NwGeolocAlgo,
    dilution: uplink.DevLocDilution,
  };
}

/**
 * Extract asset metadata for Layer 1 compliance
 */
function extractAssetMetadata(uplink) {
  const customerData = uplink.CustomerData || {};
  const driverCfg = uplink.DriverCfg || {};
  const baseStation = uplink.BaseStationData || {};

  return {
    // Asset Type & Classification
    assetType: "ENERGY_METER", // Default, should be mapped from driver
    manufacturer: driverCfg.mod?.pId || "Unknown",
    model: driverCfg.app?.mId || "Unknown",
    productId: driverCfg.mod
      ? `${driverCfg.mod.pId}/${driverCfg.mod.mId}`
      : null,
    firmwareVersion: driverCfg.mod?.ver || null,
    driverId: driverCfg.id,

    // Ownership & Tenant Info
    customerID: uplink.CustomerID,
    customerId: uplink.CustomerID, // Alias
    tags: customerData.tags || [],
    domains: customerData.doms || [],

    // Site Information
    siteId: extractSiteId(customerData.doms),
    siteName: customerData.doms?.[0]?.n || null,
    tenantId: customerData.doms?.[0]?.g || "Unknown",

    // Base Station (Gateway) Info
    baseStationName: baseStation.name,
    baseStationDomains: baseStation.doms || [],

    // Model Configuration
    modelConfig: uplink.ModelCfg,

    // Additional metadata
    alr: customerData.alr, // Application Layer Reference
  };
}

/**
 * Extract signal quality metrics
 */
function extractSignalQuality(uplink) {
  const primaryGateway = uplink.Lrrs?.Lrr?.[0] || {};

  return {
    // Primary Gateway Signal
    rssi: uplink.LrrRSSI || primaryGateway.LrrRSSI,
    snr: uplink.LrrSNR || primaryGateway.LrrSNR,
    esp: uplink.LrrESP || primaryGateway.LrrESP,

    // Packet Error Rate
    instantPER: uplink.InstantPER,
    meanPER: uplink.MeanPER,

    // Link Quality
    lostUplinks: uplink.LostUplinksAS || 0,

    // Multi-gateway reception
    gatewayCount: uplink.DevLrrCnt || 1,
    allGateways: uplink.Lrrs?.Lrr || [],
  };
}

/**
 * Extract gateway (LRR) information
 */
function extractGatewayInfo(uplink) {
  const gateways = uplink.Lrrs?.Lrr || [];

  return {
    // Primary gateway
    primaryGatewayId: uplink.Lrrid,
    primaryLocation:
      uplink.LrrLAT && uplink.LrrLON
        ? {
            type: "Point",
            coordinates: [uplink.LrrLON, uplink.LrrLAT],
          }
        : null,

    // All gateways that received this message
    gateways: gateways.map((g) => ({
      id: g.Lrrid,
      chain: g.Chain,
      rssi: g.LrrRSSI,
      snr: g.LrrSNR,
      esp: g.LrrESP,
    })),

    // Network info
    subBand: uplink.SubBand,
    channel: uplink.Channel,
    lrcId: uplink.Lrcid,
  };
}

/**
 * Extract site ID from domains array
 */
function extractSiteId(domains) {
  if (!domains || domains.length === 0) {
    return "Unknown";
  }

  // Parse domain name: "VEEP/Vietnam/Nedspice" -> "Nedspice"
  const domainName = domains[0].n || "";
  const parts = domainName.split("/");
  return parts[parts.length - 1] || "Unknown";
}

/**
 * Map device model to asset type
 */
function mapDeviceToAssetType(driverCfg) {
  const model = driverCfg?.app?.mId?.toLowerCase() || "";

  // Mapping rules
  if (model.includes("uc100") || model.includes("elite")) {
    return "ENERGY_METER";
  }
  if (model.includes("chiller") || model.includes("hvac")) {
    return "CHILLER";
  }
  if (model.includes("sensor")) {
    return "SENSOR";
  }
  if (model.includes("gateway")) {
    return "GATEWAY";
  }

  return "UNKNOWN";
}

/**
 * Create geohash from coordinates (simple implementation)
 * For production, use proper geohash library
 */
function createGeohash(lat, lon, precision = 8) {
  // Simple geohash - in production use: const geohash = require('ngeohash');
  // return geohash.encode(lat, lon, precision);

  // Placeholder: return quadkey-like identifier
  return `${Math.round(lat * 1000000)}_${Math.round(lon * 1000000)}`;
}

module.exports = {
  parseLoRaWANUplink,
  extractLocation,
  extractAssetMetadata,
  extractSignalQuality,
  extractGatewayInfo,
  mapDeviceToAssetType,
  createGeohash,
};
