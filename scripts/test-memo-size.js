/**
 * Test Script for Memo Data Size Optimization
 * Verifies that optimized memo data fits within Solana's 566-byte limit
 */

require("dotenv").config();
const { getPool } = require("../src/clients/database");
const SolanaClient = require("../src/clients/solana");
const { generateBatchHash } = require("../src/services/hashGenerator");
const cfg = require("../src/config");

async function testMemoSizes() {
  console.log("🧪 Testing Memo Data Size Optimization\n");
  console.log("=".repeat(60));

  try {
    const pool = getPool();
    const solanaClient = new SolanaClient(cfg.solana);

    // Get a recent batch from database
    const result = await pool.query(`
      SELECT * FROM batches 
      WHERE asset_ids IS NOT NULL 
      ORDER BY end_timestamp DESC 
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log("⚠️  No batches found with asset data");
      return;
    }

    console.log(`\n📦 Testing ${result.rows.length} recent batches:\n`);

    let allPassed = true;

    for (const batch of result.rows) {
      // Simple hash for testing (not using full generateBatchHash that needs message hashes)
      const batchHash = `test-hash-${batch.batch_id.substring(0, 8)}`;

      // Create memo data
      const memoData = solanaClient.createMemoData(batch, batchHash);
      const size = memoData.length;
      const passed = size <= 566;

      const status = passed ? "✅" : "❌";
      const sizeStatus = passed
        ? `${size}/566 bytes`
        : `${size}/566 bytes (EXCEEDED!)`;

      console.log(`${status} Batch: ${batch.batch_id.substring(0, 8)}...`);
      console.log(`   Size: ${sizeStatus}`);
      console.log(`   Messages: ${batch.message_count}`);
      console.log(`   Assets: ${(batch.asset_ids || []).length}`);
      console.log(`   Asset Types: ${(batch.asset_types || []).length}`);
      console.log(`   Sites: ${(batch.site_ids || []).length}`);

      // Parse and show compact structure
      const parsed = JSON.parse(memoData);
      console.log(`   Compact keys: ${Object.keys(parsed).join(", ")}`);

      // Expand and show readable format
      const expanded = solanaClient.expandMemoData(parsed);
      console.log(`   Expanded type: ${expanded.type} v${expanded.version}`);

      if (expanded.asset) {
        console.log(`   Asset IDs in memo: ${expanded.asset.assetIds.length}`);
        if (expanded.asset.locationSummary) {
          const loc = expanded.asset.locationSummary.centroid;
          console.log(`   Location: (${loc.lat}, ${loc.lon})`);
        }
      }

      console.log();

      if (!passed) {
        allPassed = false;
        console.log("❌ FAILED: Memo data exceeds 566 bytes!\n");
        console.log("Raw memo data:");
        console.log(memoData);
        console.log();
      }
    }

    console.log("=".repeat(60));

    if (allPassed) {
      console.log("🎉 All batches passed! Memo data optimized successfully!");
      console.log("\n✨ Optimization benefits:");
      console.log("   - Short JSON keys (t, v, bid, h, mc, ts, etc.)");
      console.log("   - Unix timestamps instead of ISO strings");
      console.log("   - Limited asset IDs (max 3 per batch)");
      console.log("   - Compact location data (6 decimal places)");
      console.log("   - Removed null fields");

      // Calculate average size
      const sizes = result.rows.map((batch) => {
        const hash = `test-hash-${batch.batch_id.substring(0, 8)}`;
        return solanaClient.createMemoData(batch, hash).length;
      });
      const avgSize = Math.round(
        sizes.reduce((a, b) => a + b, 0) / sizes.length
      );
      const maxSize = Math.max(...sizes);

      console.log(`\n📊 Statistics:`);
      console.log(`   Average size: ${avgSize} bytes`);
      console.log(`   Max size: ${maxSize} bytes`);
      console.log(`   Limit: 566 bytes`);
      console.log(`   Margin: ${566 - maxSize} bytes`);
    } else {
      console.log("❌ Some batches failed! Need further optimization.");
    }

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testMemoSizes();
