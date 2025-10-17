# Technical Architecture - Solana Blockchain Integration

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Phase:** Solana Integration

---

## 1. High-Level Architecture

### 1.1 System Overview với Solana

```
┌──────────────────────────────────────────────────────────────┐
│                    EXISTING BRIDGE SERVICE                   │
│                                                              │
│  IoT Devices → MQTT → Queue → Batch → Hash → PostgreSQL      │
│                                                              │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                   NEW: BLOCKCHAIN SERVICE                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │         Blockchain Recording Worker                     │ │
│  │  - Receives batch completion events                     │ │
│  │  - Attempts Solana transaction                          │ │
│  │  - Updates database with result                         │ │
│  └─────────────────┬───────────────────────────────────────┘ │
│                    │                                         │
│         ┌──────────┴──────────┐                              │
│         │                     │                              │
│    Success ✓            Failed ✗                             │
│         │                     │                              │
│         │                     ▼                              │
│         │          ┌──────────────────────┐                  │
│         │          │   Retry Queue        │                  │
│         │          │   (PostgreSQL)       │                  │
│         │          │   - status='pending' │                  │
│         │          │   - retry_count < 10 │                  │
│         │          └──────────┬───────────┘                  │
│         │                     │                              │
│         │                     ▼                              │
│         │          ┌──────────────────────┐                  │
│         │          │   Retry Worker       │                  │
│         │          │   - Runs every 5min  │                  │
│         │          │   - Process pending  │                  │
│         │          │   - Update status    │                  │
│         │          └──────────────────────┘                  │
│         │                                                    │
│         └─────────────────│
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │   Solana Mainnet     │
                 │   - Memo Program     │
                 │   - Public Ledger    │
                 └──────────────────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Solana Explorer     │
                 │  (Customer View)     │
                 └──────────────────────┘
```

### 1.2 Component Interaction Flow

```
HAPPY PATH:
1. Batch completed → Hash generated → DB saved
2. Blockchain Service receives batch info
3. Create Solana memo transaction
4. Send transaction → Get signature
5. Wait for confirmation (commitment: 'confirmed')
6. Update DB: status='confirmed', signature='5j7s8d...'
7. Done ✓

FAILURE PATH:
1. Batch completed → Hash generated → DB saved
2. Blockchain Service receives batch info
3. Create Solana memo transaction
4. Send transaction → FAILS (network error, timeout, etc.)
5. Catch error → Log error
6. Update DB: status='pending', retry_count++, last_error='...'
7. Retry Worker picks up after 5 minutes
8. Attempt again → If success, update status='confirmed'
9. If max retries (10) reached → status='failed'
```

---

## 2. Component Design

### 2.1 Solana Client Component

**Responsibilities:**

- Manage connection to Solana RPC
- Handle wallet keypair
- Create and send memo transactions
- Monitor transaction confirmation
- Check wallet balance
- Handle RPC errors

**Technology:**

- `@solana/web3.js` v1.87+
- `bs58` for key encoding
- Connection to mainnet-beta RPC

**Class Structure:**

```javascript
class SolanaClient {
  - connection: Connection
  - wallet: Keypair
  - isHealthy: boolean

  + constructor()
  + loadWallet(): Keypair
  + checkHealth(): Promise<HealthStatus>
  + recordBatch(batch, hash): Promise<Result>
  + verifyBatch(signature): Promise<Verification>
  + getWalletBalance(): Promise<number>
}
```

**Key Methods:**

```javascript
async recordBatch(batch, batchHash) {
  // 1. Create memo data
  const memoData = {
    type: 'VERIOT_BATCH',
    batchId, batchHash, messageCount, timestamps
  };

  // 2. Build transaction
  const tx = new Transaction()
    .add(transferToSelf(1 lamport))
    .add(memoInstruction(memoData));

  // 3. Send with retries
  const signature = await sendAndConfirmTransaction(
    connection, tx, [wallet],
    { commitment: 'confirmed', maxRetries: 3 }
  );

  return { success: true, signature };
}
```

**Error Handling:**

```javascript
try {
  return await recordBatch(...);
} catch (error) {
  if (error.message.includes('429')) {
    // Rate limited
    return { success: false, error: 'RATE_LIMITED', retryable: true };
  }
  if (error.message.includes('blockhash')) {
    // Expired blockhash
    return { success: false, error: 'BLOCKHASH_EXPIRED', retryable: true };
  }
  if (error.message.includes('insufficient')) {
    // No funds
    return { success: false, error: 'INSUFFICIENT_FUNDS', retryable: false };
  }
  // Generic error
  return { success: false, error: error.message, retryable: true };
}
```

---

### 2.2 Blockchain Service Component

**Responsibilities:**

- Orchestrate blockchain recording
- Manage retry queue
- Update database status
- Provide statistics
- Run retry worker

**State Management:**

```javascript
class BlockchainService {
  - solanaClient: SolanaClient
  - retryWorker: Worker
  - isProcessingRetries: boolean
  - metrics: MetricsCollector

  + start(): Promise<void>
  + stop(): Promise<void>
  + recordBatchWithFallback(batch, hash): Promise<Result>
  + addToRetryQueue(batch, error): Promise<void>
  + processRetryQueue(): Promise<void>
  + getStatistics(): Promise<Stats>
}
```

**Recording Flow:**

```javascript
async recordBatchWithFallback(batch, batchHash) {
  const startTime = Date.now();

  try {
    // 1. Check Solana health
    if (!solanaClient.isHealthy) {
      await addToRetryQueue(batch, batchHash, 'SOLANA_UNHEALTHY');
      return { success: false, queued: true };
    }

    // 2. Attempt recording
    const result = await solanaClient.recordBatch(batch, batchHash);

    // 3. Handle result
    if (result.success) {
      await updateStatus(batch.id, 'confirmed', result.signature);
      metrics.recordSuccess(Date.now() - startTime);
      return result;
    } else {
      if (result.retryable) {
        await addToRetryQueue(batch, batchHash, result.error);
      } else {
        await updateStatus(batch.id, 'failed', null, result.error);
      }
      metrics.recordFailure(result.error);
      return result;
    }
  } catch (error) {
    await addToRetryQueue(batch, batchHash, error.message);
    return { success: false, queued: true };
  }
}
```

**Retry Worker:**

```javascript
startRetryWorker() {
  setInterval(async () => {
    if (this.isProcessingRetries) return;

    this.isProcessingRetries = true;
    try {
      await this.processRetryQueue();
    } finally {
      this.isProcessingRetries = false;
    }
  }, 5 * 60 * 1000); // 5 minutes
}

async processRetryQueue() {
  // 1. Get pending batches (limit 10 per run)
  const pending = await database.query(`
    SELECT * FROM batches
    WHERE solana_status = 'pending'
      AND solana_retry_count < 10
    ORDER BY created_at ASC
    LIMIT 10
  `);

  // 2. Check Solana health
  const health = await solanaClient.checkHealth();
  if (!health.healthy) {
    logger.warn('Solana unhealthy, skipping retry');
    return;
  }

  // 3. Process each batch
  for (const batch of pending.rows) {
    await sleep(1000); // Rate limiting

    const result = await solanaClient.recordBatch(batch, batch.batch_hash);

    if (result.success) {
      await updateStatus(batch.batch_id, 'confirmed', result.signature);
    } else {
      await incrementRetryCount(batch.batch_id, result.error);

      if (batch.solana_retry_count + 1 >= 10) {
        await updateStatus(batch.batch_id, 'failed', null, 'MAX_RETRIES');
      }
    }
  }
}
```

---

### 2.3 Verification Component

**Purpose:** Allow customers to verify batches

**Public API Endpoint:**

```javascript
GET /verify/:batchId

Response:
{
  "batch": {
    "id": "550e8400...",
    "hash": "a3f5e9b2...",
    "messageCount": 1000,
    "timestamp": "2025-10-01T10:00:00Z"
  },
  "blockchain": {
    "status": "confirmed",
    "signature": "5j7s8dH3kS9...",
    "blockTime": 1696156800,
    "explorer": "https://explorer.solana.com/tx/5j7s8dH3kS9...",
    "verified": true,
    "onChainData": {
      "type": "VERIOT_BATCH",
      "batchHash": "a3f5e9b2...",
      "messageCount": 1000
    }
  }
}
```

**Verification Logic:**

```javascript
async verifyBatch(batchId) {
  // 1. Get batch from database
  const batch = await storage.getBatch(batchId);
  if (!batch) throw new Error('Batch not found');

  // 2. Check blockchain status
  if (batch.solana_status !== 'confirmed') {
    return {
      verified: false,
      reason: `Batch status is ${batch.solana_status}`,
      batch
    };
  }

  // 3. Verify on Solana
  const txResult = await solanaClient.verifyBatch(
    batch.solana_tx_signature
  );

  // 4. Compare hashes
  const hashMatch =
    txResult.data.batchHash === batch.batch_hash;

  return {
    verified: hashMatch,
    batch,
    blockchain: txResult,
    explorer: `https://explorer.solana.com/tx/${batch.solana_tx_signature}`
  };
}
```

---

## 3. Data Flow

### 3.1 Normal Flow (Success)

```
Time   Component                Action
─────  ─────────────────────── ──────────────────────────────
T+0s   BatchProcessor          Batch completed, hash generated
T+0s   Storage                 Batch saved to PostgreSQL
T+0s   BlockchainService       Receives batch info
T+1s   SolanaClient            Creates memo transaction
T+2s   Solana Network          Transaction sent
T+5s   Solana Network          Transaction confirmed
T+6s   SolanaClient            Confirmation received
T+7s   BlockchainService       Updates DB: status='confirmed'
T+7s   Done                    ✓
```

### 3.2 Failure and Retry Flow

```
Time      Component            Action
────────  ──────────────────  ────────────────────────────
T+0s      BatchProcessor      Batch completed
T+0s      BlockchainService   Attempts Solana recording
T+2s      Solana Network      FAILS (network error)
T+3s      BlockchainService   Updates DB: status='pending'
...
T+5min    RetryWorker         Picks up pending batch
T+5min    SolanaClient        Retries transaction
T+5min    Solana Network      SUCCESS
T+5min    BlockchainService   Updates DB: status='confirmed'
```

### 3.3 Customer Verification Flow

```
Time   Actor                   Action
─────  ────────────────────── ──────────────────────────────
T+0    Customer               Receives batch report
T+0    Customer               Visits /verify/550e8400...
T+1    API Server             Queries database for batch
T+2    API Server             Calls solanaClient.verifyBatch()
T+3    Solana RPC             Returns transaction data
T+4    API Server             Compares hashes
T+5    Customer               Sees verification result + Explorer link
T+6    Customer               Clicks Explorer link
T+7    Solana Explorer        Shows public transaction
T+8    Customer               Sees memo data matches report ✓
```

---

## 4. Error Handling Strategy

### 4.1 Error Categories

| Error Type           | Retryable? | Action                             | Alert?              |
| -------------------- | ---------- | ---------------------------------- | ------------------- |
| Network timeout      | Yes        | Add to retry queue                 | After 3 consecutive |
| RPC rate limit       | Yes        | Add to retry queue, increase delay | After 10/hour       |
| Insufficient balance | No         | Mark failed, alert immediately     | Yes                 |
| Invalid transaction  | No         | Log error, mark failed             | Yes                 |
| Blockhash expired    | Yes        | Retry immediately                  | No                  |
| Solana outage        | Yes        | Add to retry queue                 | After 1 hour        |
| Transaction timeout  | Yes        | Add to retry queue                 | After 5 consecutive |

### 4.2 Retry Strategy

**Exponential Backoff:**

```javascript
const retryDelay = Math.min(INITIAL_DELAY * Math.pow(2, retryCount), MAX_DELAY);

// Example:
// Retry 1: 5 minutes
// Retry 2: 5 minutes (not exponential, constant for simplicity)
// ...
// Retry 10: 5 minutes → Mark as failed
```

**Rate Limiting:**

```javascript
// Between retries in same batch
await sleep(1000); // 1 second

// Between different batches
const BATCH_DELAY_MS = 100; // 10 tx/second max
```

---

## 5. Monitoring & Observability

### 5.1 Metrics

```javascript
// Counters
blockchain_transactions_sent_total;
blockchain_transactions_confirmed_total;
blockchain_transactions_failed_total;
blockchain_retries_total;

// Gauges
blockchain_pending_count; // Current retry queue size
blockchain_wallet_balance_sol; // Current wallet balance

// Histograms
blockchain_confirmation_duration_seconds;
blockchain_transaction_cost_sol;

// Summary
blockchain_success_rate_percent;
```

### 5.2 Health Check

```javascript
GET /health response:
{
  "components": {
    ...existing components...,
    "blockchain": {
      "status": "healthy",
      "solanaRPC": {
        "connected": true,
        "blockHeight": 245678901,
        "latency": 234
      },
      "wallet": {
        "publicKey": "8zWT...",
        "balance": 0.4523,
        "balanceStatus": "ok"  // ok, low, critical
      },
      "retryQueue": {
        "pending": 3,
        "failed": 2
      },
      "lastTransaction": {
        "signature": "5j7s8dH3...",
        "timestamp": "2025-10-01T10:05:00Z",
        "status": "confirmed"
      }
    }
  }
}
```

### 5.3 Logging Strategy

**Log Levels:**

```javascript
// DEBUG
logger.debug("Creating memo transaction", { batchId, hash });

// INFO
logger.info("Batch recorded on blockchain", {
  batchId,
  signature,
  duration,
});

// WARN
logger.warn("Wallet balance low", { balance: 0.08 });
logger.warn("Retry attempt", { batchId, attempt: 3 });

// ERROR
logger.error("Transaction failed", {
  batchId,
  error,
  retryable: true,
});
```

**Sensitive Data:**

```javascript
// ❌ NEVER LOG
- Private key (in any form)
- Full transaction objects (may contain private data)

// ✅ SAFE TO LOG
- Public key
- Transaction signature
- Batch hash
- Error messages (sanitized)
```

---

## 6. Security Considerations

### 6.1 Private Key Management

**Storage:**

```bash
# .env (local development)
SOLANA_PRIVATE_KEY=base58_encoded_key

# Production options:
# 1. Environment variable (encrypted at rest)
# 2. AWS Secrets Manager
# 3. HashiCorp Vault
# 4. Hardware Security Module (HSM)
```

**Loading:**

```javascript
loadWallet() {
  // 1. Validate environment
  if (!process.env.SOLANA_PRIVATE_KEY) {
    throw new Error('SOLANA_PRIVATE_KEY not set');
  }

  // 2. Decode
  const privateKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY);

  // 3. Validate key length
  if (privateKey.length !== 64) {
    throw new Error('Invalid private key length');
  }

  // 4. Create keypair
  const wallet = Keypair.fromSecretKey(privateKey);

  // 5. Log public key only
  logger.info('Wallet loaded', {
    publicKey: wallet.publicKey.toBase58()
  });

  return wallet;
}
```

### 6.2 Transaction Security

**Memo Data Validation:**

```javascript
// Only include non-sensitive metadata
const memoData = {
  type: "VERIOT_BATCH", // ✓ Safe
  batchHash: "...", // ✓ Safe (hash, not data)
  messageCount: 1000, // ✓ Safe (count, not content)
  timestamp: "...", // ✓ Safe
  // deviceIds: [...]      // ✗ Do NOT include
  // rawData: {...}        // ✗ Do NOT include
};

// Size check
if (JSON.stringify(memoData).length > 566) {
  throw new Error("Memo data exceeds 566 bytes");
}
```

---

## 7. Cost Optimization

### 7.1 Transaction Cost Breakdown

```
Per Transaction:
- Base fee: ~0.000005 SOL
- Memo instruction: ~0.00000024 SOL
- Total: ~0.0000052 SOL ≈ $0.00025

Daily (8,640 batches):
- 8,640 × $0.00025 = $2.16/day

Monthly:
- $2.16 × 30 = $64.80/month
```

### 7.2 Optimization Strategies

**Strategy 1: Increase Batch Size**

```
Current: 1000 messages/batch → 8,640 batches/day
Optimized: 5000 messages/batch → 1,728 batches/day
Savings: 80% reduction → $12.96/month instead of $64.80
```

**Strategy 2: Checkpoint Approach**

```
Record merkle root every hour instead of per-batch
Cost: 24 tx/day × $0.00025 = $0.006/day = $2.16/year
Savings: 99.7% reduction
Trade-off: Less granular verification
```

**Strategy 3: Hybrid**

```
- Critical batches: Immediate recording
- Normal batches: Hourly checkpoint
- Development/testing: Skip blockchain
```

---

## 8. Deployment Architecture

### 8.1 Component Deployment

```
┌─────────────────────────────────────────────┐
│         Docker Container / Process          │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Bridge Service (Main Process)       │   │
│  │  - MQTT Client                       │   │
│  │  - Batch Processor                   │   │
│  │  - Storage Service                   │   │
│  │  - API Server (port 3000)            │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Blockchain Service (Worker Thread)  │   │
│  │  - Solana Client                     │   │
│  │  - Retry Worker                      │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  Environment Variables:                     │
│  - SOLANA_PRIVATE_KEY                       │
│  - SOLANA_RPC_URL                           │
└─────────────────────────────────────────────┘
```

### 8.2 Network Architecture

```
Internet
   │
   ├─→ Solana Mainnet (api.mainnet-beta.solana.com)
   │   └─ Memo Program
   │
   ├─→ MQTT Broker (existing)
   │
   └─→ Bridge Service
       ├─ PostgreSQL (local)
       └─ Redis (local)
```

---

## 9. Failure Scenarios & Recovery

### 9.1 Solana Network Down

**Detection:**

```javascript
// Health check fails
const health = await solanaClient.checkHealth();
if (!health.healthy) {
  // Solana is down
}
```

**Response:**

1. Continue processing batches normally (DB only)
2. All blockchain recordings go to retry queue
3. Alert: "Solana unavailable, queueing transactions"
4. When Solana recovers, retry worker processes queue

**Recovery Time:** Depends on queue size

- 100 pending: ~17 minutes (10 tx/minute)
- 1000 pending: ~2.8 hours

### 9.2 Wallet Drained

**Detection:**

```javascript
const balance = await solanaClient.getWalletBalance();
if (balance < 0.01) {
  // Critical: Cannot send transactions
}
```

**Response:**

1. Alert immediately
2. Mark all new batches as status='pending'
3. Stop attempting transactions
4. Wait for manual top-up

**Prevention:**

- Alert at 0.1 SOL
- Monitor daily spend
- Set up auto-alerts

### 9.3 Database Failure

**Scenario:** PostgreSQL down

**Impact:**

- Batches cannot be saved
- Blockchain recording cannot proceed
- System must stop

**Recovery:**

- Database must be restored
- No blockchain transactions without database

---

## 10. Testing Strategy

### 10.1 Unit Tests

```javascript
// Solana Client
describe("SolanaClient", () => {
  test("creates valid memo transaction", async () => {
    const tx = await client.createMemoTransaction(batch);
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[1].programId).toEqual(MEMO_PROGRAM_ID);
  });

  test("handles insufficient balance", async () => {
    mock.balance = 0;
    const result = await client.recordBatch(batch);
    expect(result.success).toBe(false);
    expect(result.error).toBe("INSUFFICIENT_FUNDS");
  });
});

// Blockchain Service
describe("BlockchainService", () => {
  test("adds to retry queue on failure", async () => {
    mock.solana.fail();
    await service.recordBatchWithFallback(batch);

    const queued = await db.query(
      "SELECT * FROM batches WHERE solana_status = ?",
      ["pending"]
    );
    expect(queued.length).toBe(1);
  });
});
```

### 10.2 Integration Tests

```javascript
// End-to-end test (using devnet)
test("records batch to Solana devnet", async () => {
  const batch = createTestBatch();
  const result = await blockchainService.recordBatchWithFallback(batch);

  expect(result.success).toBe(true);
  expect(result.signature).toBeDefined();

  // Verify on blockchain
  const verified = await solanaClient.verifyBatch(result.signature);
  expect(verified.verified).toBe(true);
});
```

---

## Document Approval

| Role                | Name        | Date    | Status |
| ------------------- | ----------- | ------- | ------ |
| Technical Architect | [Your Name] | 2025-10 | Draft  |
| Reviewer            | TBD         | -       | -      |

---

**Next Document:** Data Model Updates
