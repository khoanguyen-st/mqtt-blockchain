/**
 * Test script for BlockchainService
 * Usage: ./scripts/devnet.sh node scripts/test-blockchain-service.js
 */

const blockchainService = require("../src/services/blockchainService");
const { getPool } = require("../src/clients/database");

async function testBlockchainService() {
  console.log("=".repeat(60));
  console.log("Testing BlockchainService");
  console.log("=".repeat(60));
  console.log("");

  try {
    // 1. Start service
    console.log("1️⃣  Starting BlockchainService...");
    await blockchainService.start();
    console.log("   ✅ Service started");
    console.log("");

    // 2. Check health
    console.log("2️⃣  Checking health...");
    const health = await blockchainService.getHealth();
    console.log("   Healthy:", health.healthy ? "✅ Yes" : "❌ No");
    if (health.healthy) {
      console.log(
        "   Solana RPC:",
        health.solana.rpc.connected ? "✅ Connected" : "❌ Disconnected"
      );
      console.log("   Wallet Balance:", health.solana.wallet.balance, "SOL");
      console.log(
        "   Retry Worker:",
        health.retryWorkerRunning ? "✅ Running" : "❌ Stopped"
      );
    }
    console.log("");

    // 3. Get initial statistics
    console.log("3️⃣  Getting initial statistics...");
    const initialStats = await blockchainService.getStatistics();
    console.log("   Total Attempts:", initialStats.stats.totalAttempts);
    console.log("   Total Success:", initialStats.stats.totalSuccess);
    console.log("   Total Failed:", initialStats.stats.totalFailed);
    console.log("   Pending in DB:", initialStats.database.pending);
    console.log("   Confirmed in DB:", initialStats.database.confirmed);
    console.log("   Failed in DB:", initialStats.database.failed);
    console.log("   Retry Queue Size:", initialStats.database.retryQueueSize);
    console.log("");

    // 4. Create a test batch in database
    console.log("4️⃣  Creating test batch in database...");
    const pool = getPool();
    const { randomUUID } = require("crypto");
    const batchId = randomUUID();
    const batchHash = "a".repeat(64);

    await pool.query(
      `INSERT INTO batches (batch_id, batch_hash, message_count, start_timestamp, end_timestamp, status, solana_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        batchId,
        batchHash,
        1000,
        new Date(Date.now() - 300000),
        new Date(),
        "completed",
        "pending",
      ]
    );
    console.log("   Batch ID:", batchId);
    console.log("   ✅ Test batch created");
    console.log("");

    // 5. Record batch to blockchain
    console.log("5️⃣  Recording batch to blockchain...");
    const batch = {
      batch_id: batchId,
      batch_hash: batchHash,
      message_count: 1000,
      start_timestamp: new Date(Date.now() - 300000).toISOString(),
      end_timestamp: new Date().toISOString(),
    };

    const recordResult = await blockchainService.recordBatchWithFallback(
      batch,
      batchHash
    );

    if (recordResult.success) {
      console.log("   ✅ Success!");
      console.log("   Signature:", recordResult.signature);
      console.log("   Duration:", recordResult.duration, "ms");
    } else if (recordResult.queued) {
      console.log("   ⏳ Queued for retry");
    } else {
      console.log("   ❌ Failed:", recordResult.error);
    }
    console.log("");

    // 6. Check batch status in database
    console.log("6️⃣  Checking batch status in database...");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

    const batchResult = await pool.query(
      `SELECT solana_status, solana_tx_signature, solana_retry_count, solana_last_error
       FROM batches WHERE batch_id = $1`,
      [batchId]
    );

    if (batchResult.rows.length > 0) {
      const batchStatus = batchResult.rows[0];
      console.log("   Status:", batchStatus.solana_status);
      console.log("   Signature:", batchStatus.solana_tx_signature || "N/A");
      console.log("   Retry Count:", batchStatus.solana_retry_count);
      if (batchStatus.solana_last_error) {
        console.log("   Last Error:", batchStatus.solana_last_error);
      }
    }
    console.log("");

    // 7. Get updated statistics
    console.log("7️⃣  Getting updated statistics...");
    const finalStats = await blockchainService.getStatistics();
    console.log("   Total Attempts:", finalStats.stats.totalAttempts);
    console.log("   Total Success:", finalStats.stats.totalSuccess);
    console.log("   Success Rate:", finalStats.stats.successRate);
    console.log("   Pending in DB:", finalStats.database.pending);
    console.log("   Confirmed in DB:", finalStats.database.confirmed);
    console.log("   Retry Queue Size:", finalStats.database.retryQueueSize);
    console.log("");

    // 8. Test retry queue processing (if there are pending batches)
    if (finalStats.database.retryQueueSize > 0) {
      console.log("8️⃣  Testing retry queue processing...");
      console.log("   Pending batches:", finalStats.database.retryQueueSize);
      console.log("   Processing retry queue...");

      await blockchainService.processRetryQueue();

      console.log("   ✅ Retry queue processed");
      console.log("");

      // Check updated stats
      const afterRetryStats = await blockchainService.getStatistics();
      console.log("   After retry:");
      console.log("   - Pending:", afterRetryStats.database.pending);
      console.log("   - Confirmed:", afterRetryStats.database.confirmed);
      console.log("   - Total Retries:", afterRetryStats.stats.totalRetries);
    } else {
      console.log("8️⃣  No pending batches in retry queue");
    }
    console.log("");

    // 9. Stop service
    console.log("9️⃣  Stopping BlockchainService...");
    await blockchainService.stop();
    console.log("   ✅ Service stopped");
    console.log("");

    console.log("=".repeat(60));
    console.log("✅ All tests completed successfully!");
    console.log("=".repeat(60));

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);

    // Try to stop service
    try {
      await blockchainService.stop();
    } catch (stopError) {
      // Ignore
    }

    process.exit(1);
  }
}

testBlockchainService();
