/**
 * Asset Metadata API Routes
 * Layer 1: Asset Identity & Provenance endpoints
 */

const express = require("express");
const router = express.Router();
const assetMetadataService = require("../../services/assetMetadataService");
const logger = require("../../utils/logger");

/**
 * GET /api/v1/assets
 * List all assets with filters
 */
router.get("/", async (req, res) => {
  try {
    const filters = {
      assetType: req.query.assetType,
      siteId: req.query.siteId,
      tenantId: req.query.tenantId,
      lifecycleStatus: req.query.lifecycleStatus,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const assets = await assetMetadataService.listAssets(filters);

    res.json({
      success: true,
      count: assets.length,
      filters,
      assets,
    });
  } catch (error) {
    logger.error("Failed to list assets", { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/assets/statistics
 * Get asset statistics summary
 */
router.get("/statistics", async (req, res) => {
  try {
    const stats = await assetMetadataService.getStatistics();

    res.json({
      success: true,
      statistics: stats,
    });
  } catch (error) {
    logger.error("Failed to get asset statistics", { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/assets/:assetId
 * Get asset by ID
 */
router.get("/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;

    const asset = await assetMetadataService.getAssetById(assetId);

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: "Asset not found",
      });
    }

    res.json({
      success: true,
      asset,
    });
  } catch (error) {
    logger.error("Failed to get asset", {
      assetId: req.params.assetId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/assets/:assetId/history
 * Get asset history
 */
router.get("/:assetId/history", async (req, res) => {
  try {
    const { assetId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = await assetMetadataService.getAssetHistory(assetId, limit);

    res.json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    logger.error("Failed to get asset history", {
      assetId: req.params.assetId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/assets/device/:deviceEUI
 * Get asset by DevEUI
 */
router.get("/device/:deviceEUI", async (req, res) => {
  try {
    const { deviceEUI } = req.params;

    const asset = await assetMetadataService.getAssetByDevEUI(deviceEUI);

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: "Asset not found",
      });
    }

    res.json({
      success: true,
      asset,
    });
  } catch (error) {
    logger.error("Failed to get asset by DevEUI", {
      deviceEUI: req.params.deviceEUI,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/v1/assets/:assetId/lifecycle
 * Update asset lifecycle status
 */
router.put("/:assetId/lifecycle", async (req, res) => {
  try {
    const { assetId } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const asset = await assetMetadataService.updateLifecycleStatus(
      assetId,
      status,
      reason
    );

    res.json({
      success: true,
      asset,
    });
  } catch (error) {
    logger.error("Failed to update lifecycle status", {
      assetId: req.params.assetId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/v1/assets/:assetId/issuer
 * Set issuer wallet for asset
 */
router.put("/:assetId/issuer", async (req, res) => {
  try {
    const { assetId } = req.params;
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: "Wallet address is required",
      });
    }

    const asset = await assetMetadataService.setIssuerWallet(
      assetId,
      walletAddress
    );

    res.json({
      success: true,
      asset,
    });
  } catch (error) {
    logger.error("Failed to set issuer wallet", {
      assetId: req.params.assetId,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
