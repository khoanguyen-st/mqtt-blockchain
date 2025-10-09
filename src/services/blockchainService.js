const SolanaClient = require("../clients/solana");
const { getPool } = require("../clients/database");
const config = require("../config");
const logger = require("../utils/logger");

/**
 * BlockchainService - Orchestrates blockchain operations
 *
 * Responsibilities:
 * - Coordinate batch recording to Solana
 * - Manage retry queue for failed transactions
 * - Update database with blockchain status
 * - Run background retry worker
 * - Provide statistics and monitoring
 */
class BlockchainService {
  constructor() {
    this.solanaClient = null;
    this.retryWorker = null;
    this.isProcessingRetries = false;
    this.isRunning = false;

    // Statistics
    this.stats = {
      totalAttempts: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalRetries: 0,
      lastError: null,
      lastSuccess: null,
    };
  }

  /**
   * Start the blockchain service
   */
  async start() {
    if (this.isRunning) {
      logger.warn("BlockchainService already running");
      return;
    }

    try {
      // Check if Solana is enabled
      if (!config.solana.enabled) {
        logger.info("Solana blockchain integration is disabled");
        return;
      }

      // Initialize Solana client
      logger.info("Starting BlockchainService...");
      this.solanaClient = new SolanaClient(config.solana);

      // Check health
      const health = await this.solanaClient.checkHealth();
      if (!health.healthy) {
        throw new Error("Solana health check failed");
      }

      logger.info("SolanaClient initialized and healthy", {
        publicKey: health.wallet.publicKey,
        balance: health.wallet.balance,
        network: config.solana.network,
      });

      // Start retry worker
      this.startRetryWorker();

      this.isRunning = true;
      logger.info("BlockchainService started successfully");
    } catch (error) {
      logger.error("Failed to start BlockchainService", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop the blockchain service
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping BlockchainService...");

    // Stop retry worker
    if (this.retryWorker) {
      clearInterval(this.retryWorker);
      this.retryWorker = null;
    }

    // Close Solana client
    if (this.solanaClient) {
      await this.solanaClient.close();
      this.solanaClient = null;
    }

    this.isRunning = false;
    logger.info("BlockchainService stopped");
  }

  /**
   * Record batch to blockchain with fallback to retry queue
   * @param {Object} batch - Batch object from database
   * @param {string} batchHash - SHA-256 hash of batch
   * @returns {Promise<Object>} Result object
   */
  async recordBatchWithFallback(batch, batchHash) {
    const startTime = Date.now();
    this.stats.totalAttempts++;

    try {
      // Check if service is running
      if (!this.isRunning || !this.solanaClient) {
        logger.warn("BlockchainService not running, adding to retry queue", {
          batchId: batch.batch_id,
        });
        await this.addToRetryQueue(batch.batch_id, "SERVICE_NOT_RUNNING");
        return { success: false, queued: true };
      }

      // Check Solana health
      if (!this.solanaClient.isHealthy) {
        logger.warn("Solana unhealthy, adding to retry queue", {
          batchId: batch.batch_id,
        });
        await this.addToRetryQueue(batch.batch_id, "SOLANA_UNHEALTHY");
        return { success: false, queued: true };
      }

      // Attempt to record on blockchain
      logger.info("Recording batch to blockchain", {
        batchId: batch.batch_id,
        messageCount: batch.message_count,
      });

      const result = await this.solanaClient.recordBatch(batch, batchHash);

      if (result.success) {
        // Update database with success
        await this.updateBatchSolanaStatus(
          batch.batch_id,
          "confirmed",
          result.signature,
          null
        );

        this.stats.totalSuccess++;
        this.stats.lastSuccess = new Date();

        logger.info("Batch recorded successfully", {
          batchId: batch.batch_id,
          signature: result.signature,
          duration: result.duration,
        });

        return {
          success: true,
          signature: result.signature,
          duration: result.duration,
        };
      } else {
        // Check if error is retryable
        if (result.retryable) {
          await this.addToRetryQueue(
            batch.batch_id,
            result.error,
            result.message
          );
          logger.warn("Batch recording failed, added to retry queue", {
            batchId: batch.batch_id,
            error: result.error,
          });
          return { success: false, queued: true };
        } else {
          // Non-retryable error, mark as failed
          await this.updateBatchSolanaStatus(
            batch.batch_id,
            "failed",
            null,
            result.message
          );

          this.stats.totalFailed++;
          this.stats.lastError = { error: result.error, time: new Date() };

          logger.error("Batch recording failed (non-retryable)", {
            batchId: batch.batch_id,
            error: result.error,
            message: result.message,
          });

          return { success: false, error: result.error };
        }
      }
    } catch (error) {
      // Unexpected error, add to retry queue
      logger.error("Unexpected error recording batch", {
        batchId: batch.batch_id,
        error: error.message,
        stack: error.stack,
      });

      await this.addToRetryQueue(
        batch.batch_id,
        "UNEXPECTED_ERROR",
        error.message
      );

      this.stats.lastError = { error: "UNEXPECTED_ERROR", time: new Date() };

      return { success: false, queued: true, error: error.message };
    }
  }

  /**
   * Add batch to retry queue by updating database status
   * @param {string} batchId - Batch ID
   * @param {string} errorType - Error type
   * @param {string} errorMessage - Optional error message
   */
  async addToRetryQueue(batchId, errorType, errorMessage = null) {
    const pool = getPool();

    try {
      await pool.query(
        `UPDATE batches 
         SET solana_status = 'pending',
             solana_retry_count = solana_retry_count + 1,
             solana_last_error = $2
         WHERE batch_id = $1`,
        [batchId, errorMessage || errorType]
      );

      logger.debug("Added batch to retry queue", {
        batchId,
        errorType,
        errorMessage,
      });
    } catch (error) {
      logger.error("Failed to add batch to retry queue", {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update batch Solana status in database
   * @param {string} batchId - Batch ID
   * @param {string} status - Status (pending, confirmed, failed)
   * @param {string} signature - Transaction signature (if confirmed)
   * @param {string} errorMessage - Error message (if failed)
   */
  async updateBatchSolanaStatus(
    batchId,
    status,
    signature = null,
    errorMessage = null
  ) {
    const pool = getPool();

    try {
      const confirmedAt = status === "confirmed" ? new Date() : null;

      const query = `
        UPDATE batches 
        SET solana_status = $2,
            solana_tx_signature = $3,
            solana_last_error = $4,
            solana_confirmed_at = $5
        WHERE batch_id = $1
      `;

      await pool.query(query, [
        batchId,
        status,
        signature,
        errorMessage,
        confirmedAt,
      ]);

      logger.debug("Updated batch Solana status", {
        batchId,
        status,
        signature,
      });
    } catch (error) {
      logger.error("Failed to update batch Solana status", {
        batchId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Start background retry worker
   */
  startRetryWorker() {
    const intervalMs = config.blockchain.retryIntervalMs;

    logger.info("Starting retry worker", {
      intervalMs,
      intervalMinutes: intervalMs / 60000,
    });

    this.retryWorker = setInterval(async () => {
      if (this.isProcessingRetries) {
        logger.debug("Retry worker already processing, skipping this interval");
        return;
      }

      try {
        await this.processRetryQueue();
      } catch (error) {
        logger.error("Error in retry worker", { error: error.message });
      }
    }, intervalMs);

    // Also run immediately on startup
    setTimeout(() => this.processRetryQueue(), 5000); // Wait 5 seconds after startup
  }

  /**
   * Process retry queue - find pending batches and retry them
   */
  async processRetryQueue() {
    if (this.isProcessingRetries) {
      return;
    }

    this.isProcessingRetries = true;

    try {
      // Check if Solana is healthy before processing
      if (!this.solanaClient || !this.solanaClient.isHealthy) {
        logger.warn("Solana unhealthy, skipping retry queue processing");
        return;
      }

      // Get pending batches (limit to 10 per run to avoid overwhelming)
      const pool = getPool();
      const result = await pool.query(
        `SELECT b.batch_id, b.batch_hash, b.message_count, 
                b.start_timestamp, b.end_timestamp,
                b.solana_retry_count, b.solana_last_error
         FROM batches b
         WHERE b.solana_status = 'pending'
           AND b.solana_retry_count < $1
         ORDER BY b.start_timestamp ASC
         LIMIT 10`,
        [config.blockchain.maxRetries]
      );

      const pendingBatches = result.rows;

      if (pendingBatches.length === 0) {
        logger.debug("No pending batches in retry queue");
        return;
      }

      logger.info("Processing retry queue", {
        count: pendingBatches.length,
      });

      // Process each batch
      for (const batch of pendingBatches) {
        try {
          // Rate limiting: wait 1 second between retries
          await new Promise((resolve) => setTimeout(resolve, 1000));

          logger.info("Retrying batch", {
            batchId: batch.batch_id,
            retryCount: batch.solana_retry_count,
            lastError: batch.solana_last_error,
          });

          // Attempt to record
          const result = await this.solanaClient.recordBatch(
            batch,
            batch.batch_hash
          );

          if (result.success) {
            // Success! Update database
            await this.updateBatchSolanaStatus(
              batch.batch_id,
              "confirmed",
              result.signature,
              null
            );

            this.stats.totalSuccess++;
            this.stats.totalRetries++;

            logger.info("Retry successful", {
              batchId: batch.batch_id,
              signature: result.signature,
              retryCount: batch.solana_retry_count,
            });
          } else {
            // Failed again
            const newRetryCount = batch.solana_retry_count + 1;

            if (newRetryCount >= config.blockchain.maxRetries) {
              // Max retries reached, mark as failed
              await this.updateBatchSolanaStatus(
                batch.batch_id,
                "failed",
                null,
                `Max retries (${config.blockchain.maxRetries}) reached. Last error: ${result.message}`
              );

              this.stats.totalFailed++;

              logger.error("Batch failed after max retries", {
                batchId: batch.batch_id,
                retryCount: newRetryCount,
                error: result.error,
              });
            } else {
              // Increment retry count
              await pool.query(
                `UPDATE batches 
                 SET solana_retry_count = $2,
                     solana_last_error = $3
                 WHERE batch_id = $1`,
                [batch.batch_id, newRetryCount, result.message]
              );

              logger.warn("Retry failed, will try again", {
                batchId: batch.batch_id,
                retryCount: newRetryCount,
                error: result.error,
              });
            }
          }
        } catch (error) {
          logger.error("Error processing retry for batch", {
            batchId: batch.batch_id,
            error: error.message,
          });
          // Continue with next batch
        }
      }

      logger.info("Retry queue processing completed", {
        processed: pendingBatches.length,
      });
    } catch (error) {
      logger.error("Error processing retry queue", { error: error.message });
    } finally {
      this.isProcessingRetries = false;
    }
  }

  /**
   * Get blockchain service statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    const pool = getPool();

    try {
      // Get counts from database
      const result = await pool.query(`
        SELECT 
          solana_status,
          COUNT(*) as count
        FROM batches
        WHERE solana_status IS NOT NULL
        GROUP BY solana_status
      `);

      const dbStats = {};
      result.rows.forEach((row) => {
        dbStats[row.solana_status] = parseInt(row.count);
      });

      // Get pending retry queue size
      const retryQueueResult = await pool.query(
        `
        SELECT COUNT(*) as count
        FROM batches
        WHERE solana_status = 'pending'
          AND solana_retry_count < $1
      `,
        [config.blockchain.maxRetries]
      );

      const retryQueueSize = parseInt(retryQueueResult.rows[0].count);

      // Get wallet balance if available
      let walletBalance = null;
      if (this.solanaClient && this.solanaClient.isHealthy) {
        try {
          walletBalance = await this.solanaClient.getWalletBalance();
        } catch (error) {
          logger.warn("Failed to get wallet balance", { error: error.message });
        }
      }

      return {
        isRunning: this.isRunning,
        solanaHealthy: this.solanaClient ? this.solanaClient.isHealthy : false,
        network: config.solana.network,
        stats: {
          totalAttempts: this.stats.totalAttempts,
          totalSuccess: this.stats.totalSuccess,
          totalFailed: this.stats.totalFailed,
          totalRetries: this.stats.totalRetries,
          successRate:
            this.stats.totalAttempts > 0
              ? (
                  (this.stats.totalSuccess / this.stats.totalAttempts) *
                  100
                ).toFixed(2) + "%"
              : "N/A",
          lastError: this.stats.lastError,
          lastSuccess: this.stats.lastSuccess,
        },
        database: {
          confirmed: dbStats.confirmed || 0,
          pending: dbStats.pending || 0,
          failed: dbStats.failed || 0,
          retryQueueSize: retryQueueSize,
        },
        wallet: {
          balance: walletBalance,
          balanceStatus: walletBalance
            ? walletBalance < 0.05
              ? "critical"
              : walletBalance < 0.1
              ? "low"
              : "ok"
            : "unknown",
        },
      };
    } catch (error) {
      logger.error("Failed to get statistics", { error: error.message });
      throw error;
    }
  }

  /**
   * Get health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      if (!this.isRunning || !this.solanaClient) {
        return {
          healthy: false,
          reason: "Service not running",
        };
      }

      const solanaHealth = await this.solanaClient.checkHealth();

      return {
        healthy: solanaHealth.healthy,
        solana: solanaHealth,
        retryWorkerRunning: this.retryWorker !== null,
        isProcessingRetries: this.isProcessingRetries,
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message,
      };
    }
  }
}

// Create singleton instance
const blockchainService = new BlockchainService();

module.exports = blockchainService;
