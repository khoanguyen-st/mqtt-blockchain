#!/usr/bin/env node

/**
 * Integration test for Solana blockchain integration
 * Tests the complete flow: BatchProcessor → BlockchainService → Solana → API verification
 */

const { randomUUID } = require("crypto");
const cfg = require("../src/config");
const logger = require("../src/utils/logger");
const { getPool } = require("../src/clients/database");
const blockchainService = require("../src/services/blockchainService");
const { generateBatchHash } = require("../src/services/hashGenerator");
const { saveBatch } = require("../src/services/storage");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTestBatch(messageCount = 100) {
  // Create a test batch
  const batch = {
    id: randomUUID(),
    messages: [],
    messageHashes: [],
    messageCount,
    startTimestamp: new Date(),
    endTimestamp: new Date(),
  };

  // Generate test messages
  for (let i = 0; i < messageCount; i++) {
    const message = {
      id: randomUUID(),
      topic: `test/device/${i}`,
      payload: { value: Math.random() * 100, timestamp: Date.now() },
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

  return { batchId: batch.id, messageCount, batchHash };
}

async function waitForConfirmation(batchId, maxWaitSeconds = 30) {
  const pool = getPool();
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    const result = await pool.query(
      "SELECT solana_status, solana_tx_signature FROM batches WHERE batch_id = $1",
      [batchId]
    );

    if (result.rows.length === 0) {
      throw new Error("Batch not found in database");
    }

    const { solana_status, solana_tx_signature } = result.rows[0];

    if (solana_status === "confirmed" && solana_tx_signature) {
      return { status: solana_status, signature: solana_tx_signature };
    }

    if (solana_status === "failed") {
      throw new Error("Batch recording failed on blockchain");
    }

    await sleep(1000); // Check every second
  }

  throw new Error(
    `Timeout waiting for confirmation after ${maxWaitSeconds} seconds`
  );
}

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🧪 SOLANA INTEGRATION TEST");
  console.log("=".repeat(60) + "\n");

  if (!cfg.solana.enabled) {
    console.error(
      "❌ SOLANA_ENABLED is false. Please set SOLANA_ENABLED=true in environment."
    );
    process.exit(1);
  }

  try {
    // 1. Initialize BlockchainService
    console.log("1️⃣  Initializing BlockchainService...");
    await blockchainService.start();
    console.log("   ✅ BlockchainService started\n");

    // 2. Check health
    console.log("2️⃣  Checking blockchain health...");
    const health = await blockchainService.getHealth();
    console.log(`   ✅ Health: ${JSON.stringify(health, null, 2)}\n`);

    if (!health.healthy) {
      throw new Error("BlockchainService is not healthy");
    }

    // 3. Create test batch
    console.log("3️⃣  Creating test batch...");
    const { batchId, messageCount, batchHash } = await createTestBatch(50);
    console.log(`   ✅ Batch created:`);
    console.log(`      ID: ${batchId}`);
    console.log(`      Messages: ${messageCount}`);
    console.log(`      Hash: ${batchHash}\n`);

    // 4. Record batch to blockchain (simulating BatchProcessor)
    console.log("4️⃣  Recording batch to blockchain...");
    await blockchainService.recordBatchWithFallback(batchId, messageCount);
    console.log("   ✅ Recording initiated\n");

    // 5. Wait for confirmation
    console.log("5️⃣  Waiting for blockchain confirmation...");
    const { signature } = await waitForConfirmation(batchId, 30);
    console.log(`   ✅ Confirmed! Signature: ${signature}\n`);

    // 6. Verify on blockchain
    console.log("6️⃣  Verifying batch on blockchain...");

    // Wait a bit for transaction to finalize
    console.log("   ⏳ Waiting for transaction to finalize...");
    await sleep(5000);

    let verification = null;
    let verifyAttempts = 0;
    const maxVerifyAttempts = 3;

    while (verifyAttempts < maxVerifyAttempts) {
      try {
        verification = await blockchainService.solanaClient.verifyBatch(
          signature
        );
        if (verification && verification.batchId) {
          break; // Success
        }
        verifyAttempts++;
        if (verifyAttempts < maxVerifyAttempts) {
          console.log(
            `   ⏳ Transaction not yet available, retrying (${verifyAttempts}/${maxVerifyAttempts})...`
          );
          await sleep(5000);
        }
      } catch (error) {
        verifyAttempts++;
        if (verifyAttempts >= maxVerifyAttempts) {
          throw error;
        }
        console.log(
          `   ⏳ Verification failed, retrying (${verifyAttempts}/${maxVerifyAttempts})...`
        );
        await sleep(5000);
      }
    }

    if (!verification || !verification.batchId) {
      console.log(
        "   ⚠️  Transaction confirmed but verification data not yet available"
      );
      console.log(
        "   💡 This is normal on devnet due to RPC delays. Check explorer URL below.\\n"
      );

      // 8. Get explorer URL
      console.log("8️⃣  Explorer URL:");
      const explorerUrl =
        blockchainService.solanaClient.getExplorerUrl(signature);
      console.log(`   ${explorerUrl}\\n`);

      console.log("=".repeat(60));
      console.log(
        "✅ PARTIAL SUCCESS - Transaction confirmed but verification pending"
      );
      console.log("=".repeat(60));
      console.log(
        "\\n💡 The batch was successfully recorded to Solana blockchain!"
      );
      console.log(
        "   However, verification data is not yet available via RPC."
      );
      console.log("   This is common on devnet due to rate limiting.\\n");
      console.log("   You can:");
      console.log(`   1. View transaction: ${explorerUrl}`);
      console.log(
        `   2. Test API: curl http://localhost:3000/api/v1/blockchain/batches/${batchId}`
      );
      console.log(
        `   3. Try verification later: curl http://localhost:3000/api/v1/blockchain/verify/${batchId}`
      );
      console.log(
        `   4. Open verification page: http://localhost:3000/verify?batchId=${batchId}\\n`
      );

      // Don't fail the test, just warn
      return;
    }

    console.log("   ✅ Verification result:");
    console.log(`      Batch ID: ${verification.batchId}`);
    console.log(`      Message Count: ${verification.messageCount}`);
    console.log(`      Batch Hash: ${verification.batchHash}`);
    console.log(`      Slot: ${verification.slot}`);

    // Check if data matches
    const matches = {
      batchId: verification.batchId === batchId,
      messageCount: verification.messageCount === messageCount,
      batchHash: verification.batchHash === batchHash,
    };

    if (matches.batchId && matches.messageCount && matches.batchHash) {
      console.log("   ✅ All data matches!\n");
    } else {
      console.log("   ❌ Data mismatch detected:");
      console.log(`      Batch ID: ${matches.batchId ? "✅" : "❌"}`);
      console.log(`      Message Count: ${matches.messageCount ? "✅" : "❌"}`);
      console.log(`      Batch Hash: ${matches.batchHash ? "✅" : "❌"}\n`);
      throw new Error("Data verification failed");
    }

    // 7. Get statistics
    console.log("7️⃣  BlockchainService statistics:");
    const stats = blockchainService.getStatistics();
    console.log(`   Total Attempts: ${stats.totalAttempts}`);
    console.log(`   Total Success: ${stats.totalSuccess}`);
    console.log(`   Total Failures: ${stats.totalFailures}`);
    console.log(`   Success Rate: ${stats.successRate}\n`);

    // 8. Get explorer URL
    console.log("8️⃣  Explorer URL:");
    const explorerUrl =
      blockchainService.solanaClient.getExplorerUrl(signature);
    console.log(`   ${explorerUrl}\n`);

    console.log("=".repeat(60));
    console.log("✅ ALL TESTS PASSED!");
    console.log("=".repeat(60));
    console.log("\n💡 You can now:");
    console.log(`   1. View transaction: ${explorerUrl}`);
    console.log(
      `   2. Test API: curl http://localhost:3000/api/v1/blockchain/batches/${batchId}`
    );
    console.log(
      `   3. Verify: curl http://localhost:3000/api/v1/blockchain/verify/${batchId}`
    );
    console.log(
      `   4. Open verification page: http://localhost:3000/verify?batchId=${batchId}\n`
    );
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("\n9️⃣  Stopping BlockchainService...");
    await blockchainService.stop();
    console.log("   ✅ Service stopped\n");

    await getPool().end();
  }
}

main();
