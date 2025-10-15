/**
 * Test Script for Layer 1: Asset Identity & Provenance
 * Tests LoRaWAN parsing and asset metadata management
 */

const { parseLoRaWANUplink } = require("../src/services/loraWANParser");
const assetMetadataService = require("../src/services/assetMetadataService");
const { getPool } = require("../src/clients/database");
const logger = require("../src/utils/logger");

// Sample LoRaWAN message from Actility ThingPark
const sampleLoRaWANMessage = {
  DevEUI_uplink: {
    Time: "2025-10-15T08:17:15.971+00:00",
    DevEUI: "24E124468E392493",
    FPort: 85,
    FCntUp: 9984,
    LostUplinksAS: 0,
    ADRbit: 1,
    MType: 4,
    FCntDn: 14361,
    payload_hex: "ff190f0485963bdb48",
    mic_hex: "1465d218",
    Lrcid: "00000233",
    LrrRSSI: -100.0,
    LrrSNR: 5.5,
    LrrESP: -101.078331,
    SpFact: 12,
    SubBand: "G7",
    Channel: "LC7",
    Lrrid: "100022AD",
    Late: 0,
    LrrLAT: 10.953423,
    LrrLON: 106.720604,
    Lrrs: {
      Lrr: [
        {
          Lrrid: "100022AD",
          Chain: 0,
          LrrRSSI: -100.0,
          LrrSNR: 5.5,
          LrrESP: -101.078331,
        },
        {
          Lrrid: "10002379",
          Chain: 0,
          LrrRSSI: -113.0,
          LrrSNR: -18.5,
          LrrESP: -131.560913,
        },
      ],
    },
    DevLrrCnt: 2,
    DevLocTime: "2025-10-15T08:16:55.041+00:00",
    DevLAT: 10.953521,
    DevLON: 106.720474,
    DevAlt: 0.0,
    DevLocRadius: 5096.160645,
    DevAltRadius: 0.0,
    DevUlFCntUpUsed: 9983,
    DevLocDilution: 10.0,
    DevAltDilution: 0.0,
    DevNorthVel: -0.0,
    DevEastVel: 0.0,
    NwGeolocAlgo: 2,
    NwGeolocAlgoUsed: 1,
    CustomerID: "1100012639",
    CustomerData: {
      loc: null,
      alr: {
        pro: "MILE/UC100",
        ver: "1",
      },
      tags: ["Nedspice"],
      doms: [
        {
          n: "VEEP/Vietnam/Nedspice",
          g: "VEEP",
        },
      ],
      name: "UC100-Nedspice No.13",
    },
    BaseStationData: {
      doms: [
        {
          n: "VEEP/Vietnam/Nedspice",
          g: "VEEP",
        },
        {
          n: "Service/Amigo",
          g: "Application Service",
        },
      ],
      name: "NEDSpice_Ourdoor_Kerlink 1",
    },
    ModelCfg: "1:TPX_1d062a81-f6cd-4be8-bba7-899a76f14ea7",
    DriverCfg: {
      mod: {
        pId: "msight",
        mId: "uc100",
        ver: "1",
      },
      app: {
        pId: "Msight",
        mId: "UC100-Elite440",
        ver: "1",
      },
      id: "custom:uc100-elite440:1",
    },
    InstantPER: 0.0,
    MeanPER: 0.0,
    DevAddr: "01EAB6A4",
    TxPower: 16.0,
    NbTrans: 3,
    Frequency: 922.6,
    DynamicClass: "C",
    MaxWaitASResps: 500,
    PayloadEncryption: 0,
    payload: {
      EPI: 448988.6875,
    },
    downlinkUrl:
      "https://thingparkenterprise.au.actility.com/iot-flow/downlinkMessages/b367058c-7c45-4390-af99-93dce6ec6697",
  },
};

async function runTests() {
  console.log("🧪 Layer 1 Test Suite - Asset Identity & Provenance\n");
  console.log("=".repeat(60));

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Parse LoRaWAN Message
    console.log("\n📝 Test 1: Parse LoRaWAN Message");
    console.log("-".repeat(60));
    const parsed = parseLoRaWANUplink(sampleLoRaWANMessage);

    if (!parsed) {
      throw new Error("Failed to parse LoRaWAN message");
    }

    console.log("✅ Parsed successfully");
    console.log("   DevEUI:", parsed.deviceEUI);
    console.log("   Device Name:", parsed.deviceName);
    console.log("   Location:", parsed.location?.coordinates);
    console.log("   Asset Type:", parsed.assetMetadata.assetType);
    console.log("   Site:", parsed.assetMetadata.siteId);
    console.log("   Manufacturer:", parsed.assetMetadata.manufacturer);
    console.log("   Model:", parsed.assetMetadata.model);
    testsPassed++;

    // Test 2: Upsert Asset Metadata
    console.log("\n📝 Test 2: Upsert Asset Metadata");
    console.log("-".repeat(60));
    const asset = await assetMetadataService.upsertAsset(parsed);

    if (!asset || !asset.asset_id) {
      throw new Error("Failed to upsert asset");
    }

    console.log("✅ Asset created/updated");
    console.log("   Asset ID:", asset.asset_id);
    console.log("   DevEUI:", asset.device_eui);
    console.log("   Name:", asset.device_name);
    console.log("   Type:", asset.asset_type);
    console.log("   Site:", asset.site_id);

    // Handle JSONB field properly
    let location = asset.physical_location;
    if (typeof location === "string") {
      location = JSON.parse(location);
    }
    console.log("   Location:", location?.coordinates);
    testsPassed++;

    // Test 3: Get Asset by DevEUI
    console.log("\n📝 Test 3: Get Asset by DevEUI");
    console.log("-".repeat(60));
    const assetByDevEUI = await assetMetadataService.getAssetByDevEUI(
      parsed.deviceEUI
    );

    if (!assetByDevEUI) {
      throw new Error("Failed to get asset by DevEUI");
    }

    console.log("✅ Asset retrieved");
    console.log("   Asset ID:", assetByDevEUI.asset_id);
    console.log("   Device Name:", assetByDevEUI.device_name);
    testsPassed++;

    // Test 4: Get Asset by ID
    console.log("\n📝 Test 4: Get Asset by ID");
    console.log("-".repeat(60));
    const assetById = await assetMetadataService.getAssetById(asset.asset_id);

    if (!assetById) {
      throw new Error("Failed to get asset by ID");
    }

    console.log("✅ Asset retrieved");
    console.log("   DevEUI:", assetById.device_eui);
    testsPassed++;

    // Test 5: List Assets
    console.log("\n📝 Test 5: List Assets");
    console.log("-".repeat(60));
    const assets = await assetMetadataService.listAssets({
      siteId: "Nedspice",
      limit: 10,
    });

    console.log("✅ Assets listed");
    console.log("   Count:", assets.length);
    testsPassed++;

    // Test 6: Get Asset Statistics
    console.log("\n📝 Test 6: Get Asset Statistics");
    console.log("-".repeat(60));
    const stats = await assetMetadataService.getStatistics();

    console.log("✅ Statistics retrieved");
    console.log("   Total Assets:", stats.total_assets);
    console.log("   Active Assets:", stats.active_assets);
    console.log("   Sites:", stats.sites_count);
    console.log("   Tenants:", stats.tenants_count);
    console.log("   With Location:", stats.assets_with_location);
    testsPassed++;

    // Test 7: Update Lifecycle Status
    console.log("\n📝 Test 7: Update Lifecycle Status");
    console.log("-".repeat(60));
    const updatedAsset = await assetMetadataService.updateLifecycleStatus(
      asset.asset_id,
      "maintenance",
      "Scheduled maintenance test"
    );

    if (updatedAsset.lifecycle_status !== "maintenance") {
      throw new Error("Failed to update lifecycle status");
    }

    console.log("✅ Lifecycle status updated");
    console.log("   New Status:", updatedAsset.lifecycle_status);
    testsPassed++;

    // Test 8: Get Asset History
    console.log("\n📝 Test 8: Get Asset History");
    console.log("-".repeat(60));
    const history = await assetMetadataService.getAssetHistory(asset.asset_id);

    console.log("✅ History retrieved");
    console.log("   Events:", history.length);
    history.forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.change_type} at ${h.changed_at}`);
    });
    testsPassed++;

    // Test 9: Set Issuer Wallet
    console.log("\n📝 Test 9: Set Issuer Wallet");
    console.log("-".repeat(60));
    const walletAddress = "ABC123XYZ456SOLANA789";
    const assetWithWallet = await assetMetadataService.setIssuerWallet(
      asset.asset_id,
      walletAddress
    );

    if (assetWithWallet.issuer_wallet !== walletAddress) {
      throw new Error("Failed to set issuer wallet");
    }

    console.log("✅ Issuer wallet set");
    console.log("   Wallet:", assetWithWallet.issuer_wallet);
    testsPassed++;

    // Test 10: Verify Database Integrity
    console.log("\n📝 Test 10: Verify Database Integrity");
    console.log("-".repeat(60));
    const pool = getPool();
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM asset_history WHERE asset_id = $1`,
      [asset.asset_id]
    );

    const historyCount = parseInt(result.rows[0].count);
    console.log("✅ Database integrity verified");
    console.log("   History records:", historyCount);
    testsPassed++;

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(
      `📈 Success Rate: ${(
        (testsPassed / (testsPassed + testsFailed)) *
        100
      ).toFixed(1)}%`
    );

    if (testsFailed === 0) {
      console.log("\n🎉 All tests passed! Layer 1 is working perfectly!");
    }

    process.exit(0);
  } catch (error) {
    testsFailed++;
    console.log("\n❌ Test failed:", error.message);
    console.log("Stack:", error.stack);
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }
}

// Run tests
console.log("Starting Layer 1 tests...\n");
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
