const express = require("express");
const router = express.Router();
const blockchainService = require("../../services/blockchainService");
const { getBatch } = require("../../services/storage");
const cfg = require("../../config");

// Get blockchain health status
router.get("/health", async (req, res, next) => {
  try {
    if (!cfg.solana.enabled) {
      return res.json({
        enabled: false,
        message: "Blockchain integration is disabled",
      });
    }

    const health = await blockchainService.getHealth();
    res.json(health);
  } catch (e) {
    next(e);
  }
});

// Get blockchain service statistics
router.get("/stats", async (req, res, next) => {
  try {
    if (!cfg.solana.enabled) {
      return res.json({
        enabled: false,
        stats: null,
      });
    }

    const stats = blockchainService.getStatistics();
    res.json({
      enabled: true,
      ...stats,
    });
  } catch (e) {
    next(e);
  }
});

// Get blockchain verification for a specific batch
router.get("/batches/:batchId", async (req, res, next) => {
  try {
    const { batchId } = req.params;

    // Get batch from database
    const batch = await getBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }

    // Return blockchain info
    const response = {
      batchId: batch.batch_id,
      messageCount: batch.message_count,
      batchHash: batch.batch_hash,
      createdAt: batch.created_at,
      blockchain: {
        enabled: cfg.solana.enabled,
        network: cfg.solana.network,
        status: batch.solana_status || "pending",
        signature: batch.solana_tx_signature,
        confirmedAt: batch.solana_confirmed_at,
        retryCount: batch.solana_retry_count || 0,
        lastError: batch.solana_last_error,
      },
    };

    // If confirmed, add explorer URL
    if (batch.solana_tx_signature && cfg.solana.enabled) {
      const solanaClient = blockchainService.solanaClient;
      response.blockchain.explorerUrl = solanaClient.getExplorerUrl(
        batch.solana_tx_signature
      );
    }

    res.json(response);
  } catch (e) {
    next(e);
  }
});

// Verify batch on blockchain (checks if on-chain data matches database)
router.get("/verify/:batchId", async (req, res, next) => {
  try {
    const { batchId } = req.params;

    if (!cfg.solana.enabled) {
      return res.status(503).json({
        error: "Blockchain verification is not available",
        message: "Blockchain integration is disabled",
      });
    }

    // Get batch from database
    const batch = await getBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }

    // Check if batch has been recorded on blockchain
    if (!batch.solana_tx_signature) {
      return res.json({
        verified: false,
        message: "Batch not yet recorded on blockchain",
        status: batch.solana_status || "pending",
        lastError: batch.solana_last_error,
      });
    }

    // Verify on blockchain
    const solanaClient = blockchainService.solanaClient;

    try {
      const verification = await solanaClient.verifyBatch(
        batch.solana_tx_signature
      );

      // Compare on-chain data with database
      const matches = {
        batchId: verification.batchId === batch.batch_id,
        messageCount: verification.messageCount === batch.message_count,
        batchHash: verification.batchHash === batch.batch_hash,
      };

      const allMatch =
        matches.batchId && matches.messageCount && matches.batchHash;

      res.json({
        verified: allMatch,
        signature: batch.solana_tx_signature,
        explorerUrl: solanaClient.getExplorerUrl(batch.solana_tx_signature),
        matches,
        onChain: verification,
        database: {
          batchId: batch.batch_id,
          messageCount: batch.message_count,
          batchHash: batch.batch_hash,
        },
        confirmedAt: batch.solana_confirmed_at,
      });
    } catch (error) {
      res.status(500).json({
        verified: false,
        error: "Verification failed",
        message: error.message,
        signature: batch.solana_tx_signature,
      });
    }
  } catch (e) {
    next(e);
  }
});

module.exports = router;
