# Quick Start Guide - Testing Solana Integration

## Prerequisites

✅ Docker and Docker Compose installed
✅ Node.js v18+ installed
✅ Solana wallet funded on devnet (~2 SOL)

## 1. Environment Setup

```bash
# Navigate to project directory
cd /Users/khoanguyen/Self/mqtt-blockchain

# Copy devnet environment
cp .env.devnet .env

# Ensure wallet exists
ls -la wallet-devnet.json

# Check wallet balance (should have ~2 SOL)
./scripts/devnet.sh node scripts/check-balance.js
```

## 2. Start Infrastructure

```bash
# Start PostgreSQL, Redis, and Mosquitto
docker-compose up -d

# Verify services are running
docker-compose ps

# Expected output:
# postgres    running on 0.0.0.0:5432
# redis       running on 0.0.0.0:6379
# mosquitto   running on 0.0.0.0:1883
```

## 3. Initialize Database

```bash
# Apply migrations
./scripts/devnet.sh node -e "
const { getPool } = require('./src/clients/database');
const fs = require('fs');
(async () => {
  const pool = getPool();
  const sql = fs.readFileSync('scripts/migrations/003_add_solana_columns.sql', 'utf8');
  await pool.query(sql);
  console.log('Migration applied');
  await pool.end();
})();
"
```

## 4. Test Blockchain Service (Unit Test)

```bash
# Test BlockchainService in isolation
./scripts/devnet.sh node scripts/test-blockchain-service.js

# Expected output:
# ✅ Service started
# ✅ Health check passed
# ✅ Test batch created
# ✅ Batch recorded to Solana
# ✅ Database updated with signature
# ✅ Retry queue processed
```

## 5. Test Full Integration

```bash
# Test complete flow: Batch → Blockchain → Verification
./scripts/devnet.sh node scripts/test-integration.js

# Expected output:
# ✅ BlockchainService started
# ✅ Health check passed (balance, RPC connection)
# ✅ Test batch created (50 messages)
# ✅ Batch recorded to blockchain
# ✅ Transaction confirmed
# ✅ Explorer URL generated
```

## 6. Start Full Application

```bash
# Start the complete bridge service
./scripts/devnet.sh npm start

# Expected logs:
# {"msg":"Database schema ready"}
# {"msg":"BlockchainService started","network":"devnet"}
# {"msg":"API listening","port":3000}
# {"msg":"MQTT client connected"}
# {"msg":"Starting retry worker","intervalMinutes":5}
```

## 7. Test API Endpoints

Open a new terminal and test the API:

```bash
# Health check
curl http://localhost:3000/health

# Blockchain health
curl http://localhost:3000/api/v1/blockchain/health | jq

# Blockchain statistics
curl http://localhost:3000/api/v1/blockchain/stats | jq

# List all batches
curl http://localhost:3000/api/v1/batches | jq

# Get specific batch with blockchain info
curl http://localhost:3000/api/v1/blockchain/batches/<batch-id> | jq

# Verify batch on blockchain
curl http://localhost:3000/api/v1/blockchain/verify/<batch-id> | jq
```

## 8. Test MQTT → Blockchain Flow

### Publish test messages:

```bash
# Install mosquitto clients if not already installed
# macOS: brew install mosquitto
# Ubuntu: sudo apt-get install mosquitto-clients

# Publish multiple messages to trigger batch
for i in {1..1000}; do
  mosquitto_pub -h localhost -p 1883 \
    -u bridge -P bridge123 \
    -t "mqtt/things/device-$i/data" \
    -m "{\"temperature\":$((RANDOM % 100)),\"humidity\":$((RANDOM % 100)),\"timestamp\":$(date +%s)}"

  # Small delay to simulate real traffic
  sleep 0.01
done

echo "Published 1000 messages"
```

### Monitor the logs:

```bash
# In the terminal running the application, you should see:
# {"msg":"Batch completed","id":"<uuid>","count":1000}
# {"msg":"Recording batch to Solana"}
# {"msg":"Batch recorded successfully","signature":"<tx-sig>","duration":"1200ms"}
# {"msg":"Retry successful","signature":"<tx-sig>"}
```

### Check the database:

```bash
./scripts/devnet.sh node -e "
const { getPool } = require('./src/clients/database');
(async () => {
  const pool = getPool();
  const result = await pool.query(\`
    SELECT batch_id, message_count, solana_status, solana_tx_signature
    FROM batches
    ORDER BY created_at DESC
    LIMIT 5
  \`);
  console.table(result.rows);
  await pool.end();
})();
"
```

## 9. Test Verification Page

```bash
# Get the latest batch ID
BATCH_ID=$(./scripts/devnet.sh node -e "
const { getPool } = require('./src/clients/database');
(async () => {
  const pool = getPool();
  const result = await pool.query('SELECT batch_id FROM batches WHERE solana_status = \$1 ORDER BY created_at DESC LIMIT 1', ['confirmed']);
  console.log(result.rows[0].batch_id);
  await pool.end();
})();
")

# Open verification page
open "http://localhost:3000/verify?batchId=$BATCH_ID"
```

## 10. Monitor Blockchain

### View transactions on Solana Explorer:

```bash
# Get your wallet's recent transactions
open "https://explorer.solana.com/address/HgMJvtdEahtFwDX8pqFWYAegNST27xKmDDAUsSEhGBKa?cluster=devnet"

# Or view a specific transaction
curl http://localhost:3000/api/v1/blockchain/batches/<batch-id> | jq -r '.blockchain.explorerUrl' | xargs open
```

## 11. Test Retry Mechanism

### Simulate a failure:

```bash
# Stop the application (Ctrl+C)

# Create a batch manually
./scripts/devnet.sh node -e "
const { randomUUID } = require('crypto');
const { getPool } = require('./src/clients/database');
const { generateBatchHash } = require('./src/services/hashGenerator');
const { saveBatch } = require('./src/services/storage');
(async () => {
  const batch = {
    id: randomUUID(),
    messages: [{ id: randomUUID(), topic: 'test', payload: {}, receivedAt: new Date(), tenantId: 'test', siteId: 'test', deviceId: 'test', hash: randomUUID() }],
    messageHashes: ['test-hash'],
    messageCount: 1,
    startTimestamp: new Date(),
    endTimestamp: new Date()
  };
  const batchHash = generateBatchHash(batch);
  await saveBatch(batch, batchHash);
  console.log('Created batch:', batch.id);
  const pool = getPool();
  await pool.end();
})();
"

# Restart application
./scripts/devnet.sh npm start

# Watch logs - the retry worker should pick up the pending batch within 5 minutes
# You can also check the retry queue immediately:
curl http://localhost:3000/api/v1/blockchain/stats | jq '.pendingRetries'
```

## 12. Performance Testing

### Measure throughput:

```bash
# Publish 10,000 messages and measure time
time (
  for i in {1..10000}; do
    mosquitto_pub -h localhost -p 1883 \
      -u bridge -P bridge123 \
      -t "mqtt/things/device-$i/data" \
      -m "{\"value\":$RANDOM}"
  done
)

# Calculate batches per second
# Check metrics endpoint
curl http://localhost:3000/metrics | grep batch
```

## 13. Cleanup

```bash
# Stop the application (Ctrl+C)

# Stop infrastructure
docker-compose down

# Remove volumes (optional - this deletes all data)
docker-compose down -v
```

## Troubleshooting

### Issue: "Wallet balance too low"

```bash
# Request more SOL from faucet
./scripts/devnet.sh node scripts/request-airdrop.js
```

### Issue: "RPC rate limit exceeded"

```bash
# Wait a few minutes, or use a paid RPC provider
# Update .env.devnet:
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # Or paid provider
```

### Issue: "Database connection failed"

```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart if needed
docker-compose restart postgres
```

### Issue: "MQTT connection failed"

```bash
# Verify Mosquitto is running
docker-compose ps mosquitto

# Check logs
docker-compose logs mosquitto

# Test connection
mosquitto_pub -h localhost -p 1883 -u bridge -P bridge123 -t test -m "test"
```

### Issue: "Transaction not found"

This is normal on devnet due to RPC delays. The transaction is confirmed on blockchain, but RPC might take 30-60 seconds to index it. Check the Explorer URL directly.

## Quick Verification Checklist

✅ Docker services running
✅ Database migrated
✅ Wallet has balance (>0.5 SOL)
✅ BlockchainService started
✅ API responding on port 3000
✅ MQTT client connected
✅ Retry worker running
✅ Test batch recorded to blockchain
✅ Verification page accessible

## Success Indicators

When everything is working correctly, you should see:

1. **Logs**: Steady flow of batch completions and blockchain recordings
2. **API**: `/blockchain/health` returns `healthy: true`
3. **Database**: Batches have `solana_status = 'confirmed'` and `solana_tx_signature` populated
4. **Explorer**: Transactions visible on Solana Explorer
5. **Metrics**: `batches_completed` counter increasing

## Next Steps

- Test with production-like message volume
- Monitor for 24+ hours to verify stability
- Set up alerting for failures
- Plan mainnet migration
- Implement key rotation strategy

---

**Questions?** Check the documentation in `docs/solana-integration/` or review the implementation in `src/`.
