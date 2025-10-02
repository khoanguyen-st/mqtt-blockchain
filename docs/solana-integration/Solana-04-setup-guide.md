# Setup Guide - Solana Blockchain Integration

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Environment:** Local Development → Production

---

## 1. Prerequisites

### 1.1 System Requirements

**Must have from Bridge Service:**

- ✅ Bridge Service running successfully
- ✅ PostgreSQL database operational
- ✅ Redis operational
- ✅ Node.js 18+ or 20+
- ✅ At least 1 week of test data

**New requirements:**

- Internet connection for Solana RPC
- Budget: ~$100 for initial SOL purchase
- Access to purchase cryptocurrency (via exchange)

### 1.2 Knowledge Prerequisites

**Nice to have:**

- Basic understanding of blockchain concepts
- Familiarity with cryptocurrency wallets
- Understanding of public/private key cryptography

**Will be explained:**

- How Solana works
- Wallet management
- Transaction verification

---

## 2. Phase 1: Development Setup (Devnet)

### 2.1 Install Dependencies

```bash
# Navigate to project root
cd mqtt-blockchain-bridge

# Install Solana dependencies
npm install @solana/web3.js@^1.87.0 bs58@^5.0.0

# Verify installation
npm list @solana/web3.js bs58
```

**Expected output:**

```
mqtt-blockchain-bridge@1.0.0
├── @solana/web3.js@1.87.6
└── bs58@5.0.0
```

---

### 2.2 Generate Development Wallet (Devnet)

Create `scripts/generate-wallet.js`:

```javascript
const { Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const fs = require("fs");

// Generate new keypair
const wallet = Keypair.generate();

// Get keys
const publicKey = wallet.publicKey.toBase58();
const privateKey = bs58.encode(wallet.secretKey);

console.log("=".repeat(60));
console.log("SOLANA WALLET GENERATED");
console.log("=".repeat(60));
console.log("");
console.log("Public Key (safe to share):");
console.log(publicKey);
console.log("");
console.log("Private Key (KEEP SECRET):");
console.log(privateKey);
console.log("");
console.log("=".repeat(60));
console.log("IMPORTANT:");
console.log("- Save the private key in .env file");
console.log("- NEVER commit private key to Git");
console.log("- NEVER share private key with anyone");
console.log("=".repeat(60));

// Save to file for convenience (dev only!)
const walletInfo = {
  publicKey,
  privateKey,
  network: "devnet",
  generated: new Date().toISOString(),
};

fs.writeFileSync("wallet-devnet.json", JSON.stringify(walletInfo, null, 2));

console.log("");
console.log("Wallet info saved to: wallet-devnet.json");
console.log("Add to .gitignore immediately!");
```

**Run:**

```bash
node scripts/generate-wallet.js
```

**Expected output:**

```
============================================================
SOLANA WALLET GENERATED
============================================================

Public Key (safe to share):
8zWT9Yxv7V6WHw3rNXJkKpPG8DYxfKAzANcQNLoRxKPJ

Private Key (KEEP SECRET):
3kH8nF2sL9dK1vT4mP7qW6yR3jB5xN9cM2vK8pL4tF6sH9dK1vT4mP7qW6yR3jB5xN9cM2vK8pL4tF6sH9dK1v

============================================================
IMPORTANT:
- Save the private key in .env file
- NEVER commit private key to Git
- NEVER share private key with anyone
============================================================

Wallet info saved to: wallet-devnet.json
Add to .gitignore immediately!
```

**CRITICAL: Update .gitignore**

```bash
# Add to .gitignore
echo "wallet-*.json" >> .gitignore
echo ".env.devnet" >> .gitignore
echo ".env.mainnet" >> .gitignore
```

---

### 2.3 Fund Devnet Wallet

Create `scripts/request-airdrop.js`:

```javascript
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

async function requestAirdrop(publicKeyString) {
  // Connect to devnet
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const publicKey = new PublicKey(publicKeyString);

  console.log("Requesting airdrop for:", publicKeyString);
  console.log("Network: Devnet");

  try {
    // Request 2 SOL
    const signature = await connection.requestAirdrop(
      publicKey,
      2 * LAMPORTS_PER_SOL
    );

    console.log("Airdrop requested! Signature:", signature);
    console.log("Waiting for confirmation...");

    await connection.confirmTransaction(signature);

    console.log("✅ Airdrop confirmed!");

    // Check balance
    const balance = await connection.getBalance(publicKey);
    console.log("New balance:", balance / LAMPORTS_PER_SOL, "SOL");
  } catch (error) {
    console.error("❌ Airdrop failed:", error.message);

    if (error.message.includes("429")) {
      console.log("");
      console.log("Rate limited. Please try:");
      console.log("1. Wait 1 hour and try again");
      console.log("2. Use Solana faucet: https://faucet.solana.com");
    }
  }
}

// Get public key from command line
const publicKey = process.argv[2];

if (!publicKey) {
  console.error("Usage: node request-airdrop.js ");
  process.exit(1);
}

requestAirdrop(publicKey);
```

**Run:**

```bash
# Replace with your public key from step 2.2
node scripts/request-airdrop.js 8zWT9Yxv7V6WHw3rNXJkKpPG8DYxfKAzANcQNLoRxKPJ
```

**Expected output:**

```
Requesting airdrop for: 8zWT9Yxv7V6WHw3rNXJkKpPG8DYxfKAzANcQNLoRxKPJ
Network: Devnet
Airdrop requested! Signature: 3kH8nF2sL9dK1vT4mP...
Waiting for confirmation...
✅ Airdrop confirmed!
New balance: 2 SOL
```

**Alternative: Use Web Faucet**

```
1. Visit: https://faucet.solana.com
2. Select "Devnet"
3. Paste your public key
4. Click "Request Airdrop"
5. Wait for confirmation
```

---

### 2.4 Setup Environment Variables (Devnet)

Create `.env.devnet`:

```bash
# Existing Bridge Service config
MQTT_BROKER_URL=mqtt://your-broker
MQTT_USERNAME=your-username
MQTT_PASSWORD=your-password
# ... other existing vars ...

# NEW: Solana Configuration (Devnet)
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PRIVATE_KEY=your_devnet_private_key_here
SOLANA_NETWORK=devnet

# Blockchain Service Config
BLOCKCHAIN_RETRY_INTERVAL_MS=300000
BLOCKCHAIN_MAX_RETRIES=10
```

**Copy private key from wallet-devnet.json**

---

### 2.5 Verify Devnet Setup

Create `scripts/check-balance.js`:

```javascript
const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const bs58 = require("bs58");
require("dotenv").config();

async function checkBalance() {
  try {
    // Load config
    const rpcUrl = process.env.SOLANA_RPC_URL;
    const privateKey = process.env.SOLANA_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      throw new Error("Missing SOLANA_RPC_URL or SOLANA_PRIVATE_KEY");
    }

    // Connect
    const connection = new Connection(rpcUrl, "confirmed");
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));

    console.log("=".repeat(60));
    console.log("WALLET STATUS");
    console.log("=".repeat(60));
    console.log("Network:", rpcUrl);
    console.log("Public Key:", wallet.publicKey.toBase58());
    console.log("");

    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;

    console.log("Balance:", balanceSOL, "SOL");

    if (balanceSOL < 0.1) {
      console.log("⚠️  WARNING: Balance is low!");
    } else {
      console.log("✅ Balance is sufficient");
    }

    // Check connection
    const blockHeight = await connection.getBlockHeight();
    console.log("");
    console.log("RPC Status: ✅ Connected");
    console.log("Block Height:", blockHeight);

    console.log("=".repeat(60));

    return { balance: balanceSOL, connected: true };
  } catch (error) {
    console.error("❌ Error:", error.message);
    return { balance: 0, connected: false };
  }
}

checkBalance();
```

**Run:**

```bash
# Load devnet environment
export $(cat .env.devnet | xargs)

# Check balance
node scripts/check-balance.js
```

**Expected output:**

```
============================================================
WALLET STATUS
============================================================
Network: https://api.devnet.solana.com
Public Key: 8zWT9Yxv7V6WHw3rNXJkKpPG8DYxfKAzANcQNLoRxKPJ

Balance: 2 SOL
✅ Balance is sufficient

RPC Status: ✅ Connected
Block Height: 245678901
============================================================
```

---

### 2.6 Run Database Migration

```bash
# Create migration file
cat > scripts/migrations/003_add_solana_columns.sql << 'EOF'
-- Solana Integration Migration
BEGIN;

-- Add Solana columns to batches table
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS solana_tx_signature VARCHAR(88),
  ADD COLUMN IF NOT EXISTS solana_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS solana_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS solana_last_error TEXT,
  ADD COLUMN IF NOT EXISTS solana_confirmed_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_batches_solana_status
  ON batches(solana_status);

CREATE INDEX IF NOT EXISTS idx_batches_solana_pending
  ON batches(solana_status, solana_retry_count)
  WHERE solana_status = 'pending';

-- Add comments
COMMENT ON COLUMN batches.solana_tx_signature IS 'Solana transaction signature (88 chars base58)';
COMMENT ON COLUMN batches.solana_status IS 'Status: pending, sent, confirmed, failed, skipped';
COMMENT ON COLUMN batches.solana_retry_count IS 'Number of retry attempts (max 10)';

COMMIT;

-- Verify
\d batches
EOF

# Run migration
docker exec -i bridge-postgres psql -U bridge -d veep_bridge < scripts/migrations/003_add_solana_columns.sql
```

**Verify:**

```bash
docker exec -it bridge-postgres psql -U bridge -d veep_bridge -c "\d batches"
```

**Expected columns:**

```
...existing columns...
solana_tx_signature    | character varying(88)
solana_status         | character varying(20) | default 'pending'
solana_retry_count    | integer               | default 0
solana_last_error     | text
solana_confirmed_at   | timestamp with time zone
```

---

### 2.7 Test First Transaction (Devnet)

Create `scripts/test-solana-tx.js`:

```javascript
const {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
} = require("@solana/web3.js");
const bs58 = require("bs58");
require("dotenv").config();

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

async function testTransaction() {
  try {
    console.log("Testing Solana memo transaction...");
    console.log("");

    // Setup
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    const wallet = Keypair.fromSecretKey(
      bs58.decode(process.env.SOLANA_PRIVATE_KEY)
    );

    // Create test memo data
    const memoData = JSON.stringify({
      type: "VEEP_BATCH_TEST",
      batchId: "test-batch-001",
      batchHash: "a".repeat(64),
      messageCount: 1000,
      timestamp: new Date().toISOString(),
    });

    console.log("Memo data:", memoData);
    console.log("Size:", memoData.length, "bytes");
    console.log("");

    // Create transaction
    const transaction = new Transaction();

    // Add transfer (to self, minimal)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 1,
      })
    );

    // Add memo
    transaction.add({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memoData),
    });

    console.log("Sending transaction...");

    // Send
    const signature = await connection.sendTransaction(transaction, [wallet], {
      skipPreflight: false,
    });

    console.log("Transaction sent! Signature:", signature);
    console.log("Waiting for confirmation...");

    // Confirm
    await connection.confirmTransaction(signature, "confirmed");

    console.log("✅ Transaction confirmed!");
    console.log("");
    console.log("View on Solana Explorer:");
    console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log("");

    // Verify
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
    });
    console.log("Transaction details:");
    console.log("- Block Time:", new Date(tx.blockTime * 1000).toISOString());
    console.log("- Slot:", tx.slot);
    console.log("- Fee:", tx.meta.fee, "lamports");

    return signature;
  } catch (error) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

testTransaction();
```

**Run:**

```bash
export $(cat .env.devnet | xargs)
node scripts/test-solana-tx.js
```

**Expected output:**

```
Testing Solana memo transaction...

Memo data: {"type":"VEEP_BATCH_TEST","batchId":"test-batch-001"...}
Size: 187 bytes

Sending transaction...
Transaction sent! Signature: 5j7s8dH3kS9zP4qL6mR8nF2vK3jB7xC9dT5wY4hU1gN
Waiting for confirmation...
✅ Transaction confirmed!

View on Solana Explorer:
https://explorer.solana.com/tx/5j7s8dH3kS9zP4qL6mR8nF2vK3jB7xC9dT5wY4hU1gN?cluster=devnet

Transaction details:
- Block Time: 2025-10-01T10:05:00.000Z
- Slot: 245678902
- Fee: 5000 lamports
```

**Verify on Explorer:**

1. Click the Explorer link
2. See transaction details
3. Find "Instructions" section
4. See "Memo Program" instruction
5. See your memo data

---

## 3. Phase 2: Production Setup (Mainnet)

⚠️ **IMPORTANT: Only proceed after Devnet testing is successful**

### 3.1 Generate Production Wallet

```bash
# Generate new wallet for mainnet
node scripts/generate-wallet.js

# IMPORTANT: Save output to secure password manager
# - 1Password, LastPass, or similar
# - NOT in cloud notes (Google Docs, Notion, etc.)
# - NOT in Slack/Email
```

**Save securely:**

```
Wallet: Solana Mainnet Production
Public Key: [your_public_key]
Private Key: [your_private_key]
Created: 2025-10-01
Purpose: VEEP Bridge Service
```

---

### 3.2 Purchase and Transfer SOL

**Option A: Coinbase (Recommended for beginners)**

```
1. Create Coinbase account
2. Complete KYC verification
3. Add payment method (bank account/card)
4. Buy SOL:
   - Amount: $100 worth (~0.5 SOL)
   - Fees: ~$2-3
5. Withdraw to your wallet:
   - Use your public key from 3.1
   - Network: Solana
   - Amount: 0.5 SOL
   - Verify address carefully!
6. Wait 10-30 minutes for transfer
```

**Option B: Binance**

```
Similar process to Coinbase
- Lower fees
- Faster withdrawal
- More complex UI
```

**Verify Receipt:**

```bash
# Check on Solana Explorer
https://explorer.solana.com/address/YOUR_PUBLIC_KEY

# Or use script
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com \
SOLANA_PRIVATE_KEY=your_mainnet_key \
node scripts/check-balance.js
```

**Expected balance:** ~0.5 SOL

---

### 3.3 Setup Production Environment

Create `.env.mainnet`:

```bash
# Copy from existing .env
cp .env .env.mainnet

# Update Solana config
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=your_mainnet_private_key_here
SOLANA_NETWORK=mainnet

# All other settings same as .env
```

**Security checklist:**

```bash
# Verify .env files are in .gitignore
grep ".env" .gitignore

# Should see:
# .env
# .env.*
# .env.devnet
# .env.mainnet

# Verify not tracked by Git
git status --ignored | grep .env

# Should show all .env files as ignored
```

---

### 3.4 Test Mainnet Connection (Read-only first)

```bash
# Check balance (read-only, safe)
export $(cat .env.mainnet | xargs)
node scripts/check-balance.js
```

**Expected output:**

```
============================================================
WALLET STATUS
============================================================
Network: https://api.mainnet-beta.solana.com
Public Key: [your_mainnet_public_key]

Balance: 0.5 SOL
✅ Balance is sufficient

RPC Status: ✅ Connected
Block Height: 267891234
============================================================
```

---

### 3.5 Test Small Mainnet Transaction

⚠️ **This will use REAL SOL (~$0.00025)**

```bash
# Run test with mainnet config
export $(cat .env.mainnet | xargs)
node scripts/test-solana-tx.js
```

**Check transaction on Explorer:**

```
https://explorer.solana.com/tx/[signature]
```

**If successful:**

- ✅ You can see the transaction
- ✅ Memo data is visible
- ✅ Status shows "Success"
- ✅ Cost is ~5000-10000 lamports ($0.0002-0.0005)

---

## 4. Integration with Bridge Service

### 4.1 Add Solana Client Code

Copy the Solana integration code from the artifacts:

- `src/clients/solana.js`
- `src/services/blockchainService.js`

Or create from templates in Technical Architecture document.

### 4.2 Update Configuration

Update `src/config/index.js`:

```javascript
module.exports = {
  // ... existing config ...

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL,
    privateKey: process.env.SOLANA_PRIVATE_KEY,
    network: process.env.SOLANA_NETWORK || "devnet",
  },

  blockchain: {
    retryIntervalMs:
      parseInt(process.env.BLOCKCHAIN_RETRY_INTERVAL_MS) || 300000,
    maxRetries: parseInt(process.env.BLOCKCHAIN_MAX_RETRIES) || 10,
  },
};
```

### 4.3 Update BatchProcessor

Update `src/services/batchProcessor.js`:

```javascript
const blockchainService = require('./blockchainService');

async completeBatch(reason) {
  // ... existing code ...

  // Store to database
  await storage.saveBatch(this.currentBatch, batchHash);

  // NEW: Record to blockchain (non-blocking)
  if (config.solana.network === 'mainnet' || config.solana.network === 'devnet') {
    blockchainService.recordBatchWithFallback(
      this.currentBatch,
      batchHash
    ).catch(error => {
      logger.error('Blockchain recording failed, will retry', {
        batchId: this.currentBatch.id,
        error: error.message
      });
    });
  }

  // ... rest of code ...
}
```

### 4.4 Start Services

```bash
# Devnet testing
export $(cat .env.devnet | xargs)
npm run dev

# Watch logs
tail -f logs/combined.log | grep -E "blockchain|solana"

# Monitor batches
watch -n 5 'curl -s http://localhost:3000/api/v1/blockchain/stats'
```

---

## 5. Monitoring Setup

### 5.1 Check Wallet Balance Regularly

Create cron job:

```bash
# Add to crontab
crontab -e

# Check balance every hour, alert if low
0 * * * * /path/to/check-balance-alert.sh
```

Create `scripts/check-balance-alert.sh`:

```bash
#!/bin/bash
source /path/to/.env.mainnet
BALANCE=$(node /path/to/scripts/check-balance.js | grep "Balance:" | awk '{print $2}')

if (( $(echo "$BALANCE < 0.1" | bc -l) )); then
  echo "⚠️ Wallet balance low: $BALANCE SOL" | mail -s "Solana Wallet Alert" admin@example.com
fi
```

### 5.2 Monitor Transaction Success Rate

```bash
# Check Prometheus metrics
curl http://localhost:9090/metrics | grep blockchain

# Key metrics:
blockchain_transactions_sent_total
blockchain_transactions_confirmed_total
blockchain_transactions_failed_total
```

### 5.3 Setup Alerts

Using Prometheus Alertmanager:

```yaml
# alerts.yml
groups:
  - name: blockchain
    interval: 1m
    rules:
      - alert: WalletBalanceLow
        expr: blockchain_wallet_balance_sol < 0.1
        for: 5m
        annotations:
          summary: "Wallet balance is low: {{ $value }} SOL"

      - alert: HighFailureRate
        expr: rate(blockchain_transactions_failed_total[5m]) > 0.1
        for: 10m
        annotations:
          summary: "High transaction failure rate"
```

---

## 6. Customer Verification Setup

### 6.1 Add Verification Page

Create `public/verify.html`:

```html
VEEP Blockchain Verification body { font-family: -apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin:
50px auto; padding: 20px; } .status { padding: 20px; margin: 20px 0;
border-radius: 8px; } .verified { background: #d4edda; border: 1px solid
#c3e6cb; } .pending { background: #fff3cd; border: 1px solid #ffeaa7; } .failed
{ background: #f8d7da; border: 1px solid #f5c6cb; } .explorer-link { display:
inline-block; margin: 10px 0; padding: 10px 20px; background: #5468ff; color:
white; text-decoration: none; border-radius: 5px; } 🔐 Blockchain Verification
Loading... // Get batch ID from URL const batchId =
window.location.pathname.split('/').pop(); // Fetch verification
fetch(`/api/v1/batches/${batchId}/blockchain`) .then(r => r.json()) .then(data
=> { const result = document.getElementById('result'); if
(data.blockchain.status === 'confirmed') { result.innerHTML = ` ✅ Verified on
Blockchain Batch ID: ${data.batch.id} Batch Hash: ${data.batch.hash} Messages:
${data.batch.messageCount} Timestamp: ${data.batch.timestamp} Blockchain TX:
${data.blockchain.signature} View on Solana Explorer → `; } else if
(data.blockchain.status === 'pending') { result.innerHTML = ` ⏳ Pending
Confirmation This batch is being recorded to blockchain. Please check back in a
few minutes. `; } else { result.innerHTML = ` ❌ Not Yet Verified This batch has
not been confirmed on blockchain yet. `; } }) .catch(err => {
document.getElementById('result').innerHTML = ` ❌ Error Unable to verify batch:
${err.message} `; });
```

### 6.2 Add Verification Endpoint

Already in API from starter code, but verify:

```javascript
// src/api/server.js
app.get("/verify/:batchId", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/verify.html"));
});

app.get("/api/v1/batches/:batchId/blockchain", async (req, res) => {
  // Implementation from starter code
});
```

---

## 7. Operational Procedures

### 7.1 Wallet Top-up Procedure

**When balance < 0.1 SOL:**

```
1. Receive alert email
2. Login to Coinbase/Binance
3. Buy $50-100 worth of SOL
4. Withdraw to wallet address
5. Verify receipt:
   node scripts/check-balance.js
6. Document in operations log
```

### 7.2 Transaction Failure Response

**If high failure rate:**

```
1. Check Solana Explorer for network status
2. Check RPC endpoint:
   curl https://api.mainnet-beta.solana.com
3. Check wallet balance
4. Review error logs:
   grep "blockchain.*error" logs/error.log
5. If Solana outage: Wait for recovery (retry queue handles this)
6. If RPC issue: Switch to alternative RPC
7. If wallet issue: Investigate immediately
```

### 7.3 Monthly Cost Review

```bash
# Generate monthly report
node scripts/monthly-cost-report.js

# Example output:
# Transactions: 8,640
# Total cost: $2.16
# Average per transaction: $0.00025
# Wallet balance: 0.45 SOL
# Estimated remaining days: 90
```

---

## 8. Troubleshooting

### Issue: Airdrop fails (Rate limited)

**Solution:**

```
1. Wait 1 hour and try again
2. Or use web faucet: https://faucet.solana.com
3. Or request from another IP address
```

### Issue: Transaction fails with "Blockhash not found"

**Solution:**

```
This is normal occasional error.
Retry mechanism handles it automatically.
Transaction will be retried in 5 minutes.
```

### Issue: Balance draining faster than expected

**Investigation:**

```bash
# Check transaction count
psql -U bridge -d veep_bridge -c "
  SELECT DATE(created_at), COUNT(*)
  FROM batches
  WHERE solana_status = 'confirmed'
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at) DESC
  LIMIT 7;
"

# Expected: ~8,640/day
# If much higher: Check for duplicate transactions
```

### Issue: Solana Explorer shows error

**Check:**

```
1. Transaction signature correct?
2. Network correct? (mainnet vs devnet)
3. Wait a few minutes (propagation delay)
4. Check Solana status: https://status.solana.com
```

---

## 9. Rollback Procedure

**If need to disable blockchain integration:**

```sql
-- Stop recording new batches
UPDATE batches
SET solana_status = 'skipped'
WHERE solana_status = 'pending';

-- In code: Comment out blockchain recording
-- src/services/batchProcessor.js
// blockchainService.recordBatchWithFallback(...);
```

**To re-enable:**

```sql
-- Mark as pending again
UPDATE batches
SET solana_status = 'pending'
WHERE solana_status = 'skipped';

-- Uncomment code
-- Restart service
```

---

## 10. Verification Checklist

Before going to production:

**Devnet:**

- [ ] Wallet created and funded
- [ ] Can send transactions
- [ ] Can verify transactions
- [ ] Database migration completed
- [ ] Integration with Bridge Service works
- [ ] At least 10 successful batches recorded
- [ ] Retry mechanism tested

**Mainnet:**

- [ ] Production wallet created
- [ ] SOL purchased and transferred
- [ ] Balance verified (≥ 0.5 SOL)
- [ ] Test transaction successful
- [ ] Monitoring setup
- [ ] Alerts configured
- [ ] Documentation complete
- [ ] Team trained

**Operations:**

- [ ] Wallet backup secured
- [ ] Top-up procedure documented
- [ ] Cost tracking implemented
- [ ] Customer verification portal working
- [ ] Troubleshooting guide accessible

---

## Document Approval

| Role            | Name        | Date    | Status |
| --------------- | ----------- | ------- | ------ |
| DevOps Engineer | [Your Name] | 2025-10 | Draft  |
| Operations      | TBD         | -       | -      |

---

**Congratulations! You're ready to integrate Solana blockchain with your MQTT Bridge Service.**

For questions or issues, refer to:

- Technical Architecture document
- Development Plan
- Troubleshooting section above
