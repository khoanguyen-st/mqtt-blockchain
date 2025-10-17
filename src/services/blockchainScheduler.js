const cron = require("node-cron");
const { getPool } = require("../clients/database");
const config = require("../config");
const logger = require("../utils/logger");
const blockchainService = require("./blockchainService");

/**
 * BlockchainScheduler - Schedule blockchain recording at specific intervals
 *
 * Records batches to Solana blockchain every 3 hours starting from midnight
 * Schedule: 0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h (8 times per day)
 */
class BlockchainScheduler {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
    this.lastRecordTime = null;
    this.recordedBatches = 0;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn("BlockchainScheduler already running");
      return;
    }

    if (!config.solana.enabled) {
      logger.info("BlockchainScheduler disabled (Solana integration disabled)");
      return;
    }

    // Schedule: Every 3 hours at minute 0 (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)
    // Cron format: minute hour day month weekday
    // "0 */3 * * *" = At minute 0 of every 3rd hour
    this.cronJob = cron.schedule(
      // "0 */3 * * *",
      "*/10 * * * *",
      async () => {
        await this.recordBatchesToBlockchain();
      },
      {
        timezone: "Asia/Ho_Chi_Minh", // Vietnam timezone
      }
    );

    this.isRunning = true;
    logger.info("BlockchainScheduler started", {
      // schedule: "Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)",
      schedule: "Every 10 minutes",
      timezone: "Asia/Ho_Chi_Minh",
      nextRun: this.getNextRunTime(),
    });

    // Optional: Record immediately on startup if there are pending batches
    if (config.blockchain.recordOnStartup) {
      logger.info("Recording pending batches on startup...");
      setTimeout(() => this.recordBatchesToBlockchain(), 5000);
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    logger.info("BlockchainScheduler stopped");
  }

  /**
   * Get the next scheduled run time
   */
  // getNextRunTime() {
  //   const now = new Date();
  //   const currentHour = now.getHours();

  //   // Find next 3-hour slot: 0, 3, 6, 9, 12, 15, 18, 21
  //   const scheduleHours = [0, 3, 6, 9, 12, 15, 18, 21];
  //   let nextHour = scheduleHours.find((h) => h > currentHour);

  //   if (!nextHour) {
  //     // If no slot today, use first slot tomorrow
  //     nextHour = scheduleHours[0];
  //     now.setDate(now.getDate() + 1);
  //   }

  //   now.setHours(nextHour, 0, 0, 0);
  //   return now;
  // }
  getNextRunTime() {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // Find next 10-minute slot: 0, 10, 20, 30, 40, 50
    const nextMinute = Math.ceil((currentMinute + 1) / 10) * 10;

    const nextRun = new Date(now);
    if (nextMinute >= 60) {
      nextRun.setHours(nextRun.getHours() + 1);
      nextRun.setMinutes(0, 0, 0);
    } else {
      nextRun.setMinutes(nextMinute, 0, 0);
    }

    return nextRun;
  }

  /**
   * Calculate time window for current batch
   * Returns { start, end } timestamps
   */
  // getCurrentTimeWindow() {
  //   const now = new Date();
  //   const currentHour = now.getHours();

  //   // Find the current 3-hour slot
  //   const scheduleHours = [0, 3, 6, 9, 12, 15, 18, 21];
  //   let windowStartHour = 0;

  //   for (let i = scheduleHours.length - 1; i >= 0; i--) {
  //     if (currentHour >= scheduleHours[i]) {
  //       windowStartHour = scheduleHours[i];
  //       break;
  //     }
  //   }

  //   // Calculate window end (3 hours later)
  //   let windowEndHour = windowStartHour + 3;

  //   const start = new Date(now);
  //   start.setHours(windowStartHour, 0, 0, 0);

  //   const end = new Date(now);
  //   end.setHours(windowEndHour, 0, 0, 0);

  //   return { start, end };
  // }
  getCurrentTimeWindow() {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // Find the current 10-minute slot
    const windowStartMinute = Math.floor(currentMinute / 10) * 10;

    const start = new Date(now);
    start.setMinutes(windowStartMinute, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 10);

    return { start, end };
  }

  /**
   * Record all pending batches to blockchain
   */
  async recordBatchesToBlockchain() {
    if (!config.solana.enabled) {
      logger.warn("Skipping blockchain recording: Solana integration disabled");
      return;
    }

    const startTime = Date.now();
    logger.info("Starting scheduled blockchain recording...");

    try {
      const pool = getPool();

      // Get time window for batches to record
      const { start, end } = this.getCurrentTimeWindow();

      // Get all batches created in the time window that haven't been recorded yet
      const query = `
        SELECT batch_id, message_count, batch_hash, start_timestamp
        FROM batches
        WHERE start_timestamp >= $1 
          AND start_timestamp < $2
          AND (solana_status IS NULL OR solana_status = 'pending' OR solana_status = 'failed')
          AND solana_retry_count < $3
        ORDER BY start_timestamp ASC
      `;

      const result = await pool.query(query, [
        start.toISOString(),
        end.toISOString(),
        config.blockchain.maxRetries,
      ]);

      const batches = result.rows;

      if (batches.length === 0) {
        logger.info("No pending batches to record for this time window", {
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
        });
        return;
      }

      logger.info(`Found ${batches.length} batches to record`, {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        batches: batches.length,
      });

      // Record each batch
      let successCount = 0;
      let failCount = 0;

      for (const batch of batches) {
        try {
          logger.info("Recording batch to blockchain", {
            batchId: batch.batch_id,
            messageCount: batch.message_count,
            startTimestamp: batch.start_timestamp,
          });

          await blockchainService.recordBatchWithFallback(
            batch.batch_id,
            batch.message_count,
            batch.batch_hash
          );

          successCount++;

          // Add small delay between transactions to avoid rate limiting
          await this.sleep(1000);
        } catch (error) {
          logger.error("Failed to record batch to blockchain", {
            batchId: batch.batch_id,
            error: error.message,
          });
          failCount++;
        }
      }

      const duration = Date.now() - startTime;
      this.lastRecordTime = new Date();
      this.recordedBatches += successCount;

      logger.info("Scheduled blockchain recording completed", {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        totalBatches: batches.length,
        successCount,
        failCount,
        durationMs: duration,
        nextRun: this.getNextRunTime().toISOString(),
      });
    } catch (error) {
      logger.error("Error during scheduled blockchain recording", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Manually trigger recording (for testing or manual runs)
   */
  async triggerManualRecording() {
    logger.info("Manual blockchain recording triggered");
    await this.recordBatchesToBlockchain();
  }

  /**
   * Get scheduler statistics
   */
  getStatistics() {
    return {
      isRunning: this.isRunning,
      lastRecordTime: this.lastRecordTime,
      recordedBatches: this.recordedBatches,
      nextRunTime: this.isRunning ? this.getNextRunTime() : null,
      currentTimeWindow: this.getCurrentTimeWindow(),
      // schedule: "Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)",
      schedule: "Every 10 minutes",
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const blockchainScheduler = new BlockchainScheduler();

module.exports = blockchainScheduler;
