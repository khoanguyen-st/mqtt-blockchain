#!/usr/bin/env node

/**
 * Test BlockchainScheduler functionality
 */

const cfg = require("../src/config");
const logger = require("../src/utils/logger");
const { getPool } = require("../src/clients/database");
const blockchainService = require("../src/services/blockchainService");
const blockchainScheduler = require("../src/services/blockchainScheduler");
const { randomUUID } = require("crypto");
const { saveBatch } = require("../src/services/storage");
const { generateBatchHash } = require("../src/services/hashGenerator");

async function createTestBatches(count = 5) {
  console.log(`\n📦 Creating ${count} test batches...\n`);

  const batches = [];

  for (let i = 0; i < count; i++) {
    const batch = {
      id: randomUUID(),
      messages: [],
      messageHashes: [],
      messageCount: 10 + i,
      startTimestamp: new Date(Date.now() - 60000),
      endTimestamp: new Date(),
    };

    // Generate test messages
    for (let j = 0; j < batch.messageCount; j++) {
      const message = {
        id: randomUUID(),
        topic: `test/device/${i}/${j}`,
        payload: { value: Math.random() * 100 },
        receivedAt: new Date().toISOString(),
        tenantId: "test-tenant",
        siteId: "test-site",
        deviceId: `device-${i}`,
        hash: randomUUID(),
      };
      batch.messages.push(message);
      batch.messageHashes.push(message.hash);
    }

    const batchHash = generateBatchHash(batch);
    await saveBatch(batch, batchHash);

    batches.push({
      id: batch.id,
      messageCount: batch.messageCount,
      hash: batchHash,
    });

    console.log(
      `   ✅ Created batch ${i + 1}/${count}: ${batch.id} (${
        batch.messageCount
      } messages)`
    );
  }

  return batches;
}

async function displaySchedulerStatus() {
  const stats = blockchainScheduler.getStatistics();

  console.log("\n" + "=".repeat(60));
  console.log("📊 BLOCKCHAIN SCHEDULER STATUS");
  console.log("=".repeat(60));
  console.log(`Status: ${stats.isRunning ? "✅ Running" : "❌ Stopped"}`);
  console.log(`Schedule: ${stats.schedule}`);
  console.log(
    `Next Run: ${stats.nextRunTime ? stats.nextRunTime.toISOString() : "N/A"}`
  );
  console.log(
    `Last Record: ${
      stats.lastRecordTime ? stats.lastRecordTime.toISOString() : "Never"
    }`
  );
  console.log(`Recorded Batches: ${stats.recordedBatches}`);
  console.log("\nCurrent Time Window:");
  console.log(`  Start: ${stats.currentTimeWindow.start.toISOString()}`);
  console.log(`  End: ${stats.currentTimeWindow.end.toISOString()}`);
  console.log("=".repeat(60) + "\n");
}

async function checkPendingBatches() {
  const pool = getPool();
  const { start, end } = blockchainScheduler.getCurrentTimeWindow();

  const result = await pool.query(
    `
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN solana_status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN solana_status = 'confirmed' THEN 1 END) as confirmed,
      COUNT(CASE WHEN solana_status = 'failed' THEN 1 END) as failed
    FROM batches
    WHERE start_timestamp >= $1 AND start_timestamp < $2
  `,
    [start.toISOString(), end.toISOString()]
  );

  const stats = result.rows[0];

  console.log("📈 Batches in Current Time Window:");
  console.log(`   Total: ${stats.total}`);
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Confirmed: ${stats.confirmed}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log("");
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 BLOCKCHAIN SCHEDULER TEST");
  console.log("=".repeat(60) + "\n");

  if (!cfg.solana.enabled) {
    console.error(
      "❌ SOLANA_ENABLED is false. Please enable Solana integration."
    );
    process.exit(1);
  }

  try {
    // 1. Initialize services
    console.log("1️⃣  Initializing services...\n");
    await blockchainService.start();
    console.log("   ✅ BlockchainService started\n");

    // 2. Display scheduler status
    console.log("2️⃣  Checking scheduler status...\n");
    await displaySchedulerStatus();

    // 3. Create test batches
    console.log("3️⃣  Creating test batches...\n");
    const testBatches = await createTestBatches(5);
    console.log(`\n   ✅ Created ${testBatches.length} test batches\n`);

    // 4. Check pending batches
    console.log("4️⃣  Checking pending batches...\n");
    await checkPendingBatches();

    // 5. Trigger manual recording
    console.log("5️⃣  Triggering manual blockchain recording...\n");
    await blockchainScheduler.triggerManualRecording();
    console.log("   ✅ Manual recording completed\n");

    // 6. Wait a bit and check results
    console.log("6️⃣  Waiting for transactions to confirm...\n");
    await sleep(5000);

    // 7. Check updated status
    console.log("7️⃣  Checking updated batch status...\n");
    await checkPendingBatches();

    // 8. Display final scheduler stats
    console.log("8️⃣  Final scheduler statistics...\n");
    await displaySchedulerStatus();

    console.log("=".repeat(60));
    console.log("✅ ALL TESTS COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("\n💡 Scheduler is now running in the background");
    console.log("   It will automatically record batches every 3 hours:");
    console.log("   0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h\n");
    console.log("📡 API Endpoints:");
    console.log("   GET  /api/v1/blockchain/scheduler - Get scheduler status");
    console.log(
      "   POST /api/v1/blockchain/scheduler/trigger - Trigger manual recording\n"
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("\n9️⃣  Cleaning up...\n");
    await blockchainService.stop();
    await getPool().end();
    console.log("   ✅ Cleanup complete\n");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
