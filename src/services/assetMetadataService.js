/**
 * Asset Metadata Service
 * Manages Layer 1: Asset Identity & Provenance
 * Handles asset creation, updates, and retrieval for digital asset compliance
 */

const { getPool } = require("../clients/database");
const logger = require("../utils/logger");
const { createGeohash } = require("./loraWANParser");

class AssetMetadataService {
  /**
   * Create or update asset metadata from LoRaWAN message
   * @param {Object} parsedMessage - Parsed LoRaWAN uplink
   * @returns {Promise<Object>} Asset metadata record
   */
  async upsertAsset(parsedMessage) {
    const pool = getPool();

    const { deviceEUI, deviceName, assetMetadata, location } = parsedMessage;

    try {
      // Prepare physical location JSON
      const physicalLocation = location
        ? {
            type: location.type,
            coordinates: location.coordinates,
            altitude: location.altitude,
            accuracy: location.accuracy,
            geohash: createGeohash(
              location.coordinates[1],
              location.coordinates[0]
            ),
            lastUpdated: location.timestamp || new Date(),
          }
        : null;

      // Prepare specifications JSON
      const specifications = {
        protocol: "LoRaWAN",
        manufacturer: assetMetadata.manufacturer,
        model: assetMetadata.model,
        productId: assetMetadata.productId,
        firmwareVersion: assetMetadata.firmwareVersion,
        driverId: assetMetadata.driverId,
        modelConfig: assetMetadata.modelConfig,
      };

      // Upsert asset metadata
      const query = `
        INSERT INTO asset_metadata (
          device_eui,
          device_name,
          device_type,
          asset_type,
          manufacturer,
          model,
          product_id,
          firmware_version,
          physical_location,
          site_id,
          site_name,
          owner_tenant_id,
          customer_id,
          specifications,
          tags,
          domains,
          lifecycle_status
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active'
        )
        ON CONFLICT (device_eui) 
        DO UPDATE SET
          device_name = EXCLUDED.device_name,
          physical_location = EXCLUDED.physical_location,
          specifications = EXCLUDED.specifications,
          tags = EXCLUDED.tags,
          domains = EXCLUDED.domains,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        deviceEUI, // $1
        deviceName, // $2
        assetMetadata.model, // $3 device_type
        assetMetadata.assetType, // $4
        assetMetadata.manufacturer, // $5
        assetMetadata.model, // $6
        assetMetadata.productId, // $7
        assetMetadata.firmwareVersion, // $8
        JSON.stringify(physicalLocation), // $9
        assetMetadata.siteId, // $10
        assetMetadata.siteName, // $11
        assetMetadata.tenantId, // $12
        assetMetadata.customerId, // $13
        JSON.stringify(specifications), // $14
        assetMetadata.tags, // $15
        assetMetadata.domains.map((d) => d.n), // $16
      ];

      const result = await pool.query(query, values);

      logger.debug("Asset metadata upserted", {
        deviceEUI,
        assetId: result.rows[0].asset_id,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Failed to upsert asset metadata", {
        deviceEUI,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get asset by DevEUI
   * @param {string} deviceEUI - LoRaWAN DevEUI
   * @returns {Promise<Object|null>} Asset metadata
   */
  async getAssetByDevEUI(deviceEUI) {
    const pool = getPool();

    try {
      const result = await pool.query(
        "SELECT * FROM asset_metadata WHERE device_eui = $1",
        [deviceEUI]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error("Failed to get asset by DevEUI", {
        deviceEUI,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get asset by ID
   * @param {string} assetId - UUID
   * @returns {Promise<Object|null>} Asset metadata
   */
  async getAssetById(assetId) {
    const pool = getPool();

    try {
      const result = await pool.query(
        "SELECT * FROM asset_metadata WHERE asset_id = $1",
        [assetId]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error("Failed to get asset by ID", {
        assetId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List assets with filters
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of assets
   */
  async listAssets(filters = {}) {
    const pool = getPool();

    const {
      assetType,
      siteId,
      tenantId,
      lifecycleStatus = "active",
      limit = 50,
      offset = 0,
    } = filters;

    try {
      let query = "SELECT * FROM asset_metadata WHERE 1=1";
      const values = [];
      let paramCount = 0;

      if (assetType) {
        paramCount++;
        query += ` AND asset_type = $${paramCount}`;
        values.push(assetType);
      }

      if (siteId) {
        paramCount++;
        query += ` AND site_id = $${paramCount}`;
        values.push(siteId);
      }

      if (tenantId) {
        paramCount++;
        query += ` AND owner_tenant_id = $${paramCount}`;
        values.push(tenantId);
      }

      if (lifecycleStatus) {
        paramCount++;
        query += ` AND lifecycle_status = $${paramCount}`;
        values.push(lifecycleStatus);
      }

      query += " ORDER BY created_at DESC";

      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(offset);

      const result = await pool.query(query, values);

      return result.rows;
    } catch (error) {
      logger.error("Failed to list assets", {
        filters,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update asset lifecycle status
   * @param {string} assetId - Asset UUID
   * @param {string} status - New status
   * @param {string} reason - Change reason
   * @returns {Promise<Object>} Updated asset
   */
  async updateLifecycleStatus(assetId, status, reason = null) {
    const pool = getPool();

    const validStatuses = [
      "active",
      "maintenance",
      "decommissioned",
      "retired",
    ];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid lifecycle status: ${status}`);
    }

    try {
      const query = `
        UPDATE asset_metadata 
        SET lifecycle_status = $2::VARCHAR,
            decommissioned_at = CASE WHEN $2::VARCHAR IN ('decommissioned', 'retired') THEN NOW() ELSE decommissioned_at END,
            updated_at = NOW()
        WHERE asset_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [assetId, status]);

      if (result.rows.length === 0) {
        throw new Error(`Asset not found: ${assetId}`);
      }

      // Log to history
      await this.logAssetChange(assetId, "lifecycle_change", {
        status,
        reason,
      });

      logger.info("Asset lifecycle status updated", {
        assetId,
        status,
        reason,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Failed to update lifecycle status", {
        assetId,
        status,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set issuer wallet for asset
   * @param {string} assetId - Asset UUID
   * @param {string} walletAddress - Solana wallet address
   * @returns {Promise<Object>} Updated asset
   */
  async setIssuerWallet(assetId, walletAddress) {
    const pool = getPool();

    try {
      const query = `
        UPDATE asset_metadata 
        SET issuer_wallet = $2,
            updated_at = NOW()
        WHERE asset_id = $1
        RETURNING *
      `;

      const result = await pool.query(query, [assetId, walletAddress]);

      if (result.rows.length === 0) {
        throw new Error(`Asset not found: ${assetId}`);
      }

      // Log to history
      await this.logAssetChange(assetId, "issuer_assigned", {
        walletAddress,
      });

      logger.info("Issuer wallet assigned to asset", {
        assetId,
        walletAddress,
      });

      return result.rows[0];
    } catch (error) {
      logger.error("Failed to set issuer wallet", {
        assetId,
        walletAddress,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get asset history
   * @param {string} assetId - Asset UUID
   * @param {number} limit - Max records
   * @returns {Promise<Array>} History records
   */
  async getAssetHistory(assetId, limit = 50) {
    const pool = getPool();

    try {
      const query = `
        SELECT * FROM asset_history
        WHERE asset_id = $1
        ORDER BY changed_at DESC
        LIMIT $2
      `;

      const result = await pool.query(query, [assetId, limit]);

      return result.rows;
    } catch (error) {
      logger.error("Failed to get asset history", {
        assetId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log asset change to history
   * @param {string} assetId - Asset UUID
   * @param {string} changeType - Type of change
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  async logAssetChange(assetId, changeType, metadata = {}) {
    const pool = getPool();

    try {
      const query = `
        INSERT INTO asset_history (
          asset_id,
          change_type,
          new_values,
          changed_by
        ) VALUES ($1, $2, $3, $4)
      `;

      await pool.query(query, [
        assetId,
        changeType,
        JSON.stringify(metadata),
        "system", // TODO: Get from context/user session
      ]);
    } catch (error) {
      logger.error("Failed to log asset change", {
        assetId,
        changeType,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't break main operation
    }
  }

  /**
   * Get assets summary statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics() {
    const pool = getPool();

    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_assets,
          COUNT(DISTINCT asset_type) as asset_types_count,
          COUNT(DISTINCT site_id) as sites_count,
          COUNT(DISTINCT owner_tenant_id) as tenants_count,
          COUNT(CASE WHEN lifecycle_status = 'active' THEN 1 END) as active_assets,
          COUNT(CASE WHEN lifecycle_status = 'maintenance' THEN 1 END) as maintenance_assets,
          COUNT(CASE WHEN lifecycle_status = 'decommissioned' THEN 1 END) as decommissioned_assets,
          COUNT(CASE WHEN issuer_wallet IS NOT NULL THEN 1 END) as assets_with_issuer,
          COUNT(CASE WHEN physical_location IS NOT NULL THEN 1 END) as assets_with_location
        FROM asset_metadata
      `);

      return result.rows[0];
    } catch (error) {
      logger.error("Failed to get asset statistics", {
        error: error.message,
      });
      throw error;
    }
  }
}

// Singleton instance
const assetMetadataService = new AssetMetadataService();

module.exports = assetMetadataService;
