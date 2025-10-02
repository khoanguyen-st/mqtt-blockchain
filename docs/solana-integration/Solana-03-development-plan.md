# Development Plan - Solana Blockchain Integration

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Duration:** 4 weeks

---

## 1. Overview

### 1.1 Project Phases

```
Week 1: Setup & Basic Integration (Devnet)
Week 2: Reliability & Retry Logic
Week 3: Production Readiness & Testing
Week 4: Deployment & Documentation
```

### 1.2 Prerequisites Check

Before starting:

- ✅ Bridge Service PoC running successfully
- ✅ MQTT → Batching → PostgreSQL flow stable for 1+ week
- ✅ API endpoints functional
- ✅ Budget approved (~$100 initial, $80/month)
- ✅ Access to purchase SOL tokens

---

## 2. Week 1: Setup & Basic Integration

### Milestone 1.1: Environment Setup (Days 1-2)

**Objectives:**

- Setup Solana development environment
- Create and fund wallets
- Test connections

**Tasks:**

| Task                              | Est. Hours | Priority |
| --------------------------------- | ---------- | -------- |
| Install @solana/web3.js and bs58  | 0.5h       | High     |
| Generate devnet wallet keypair    | 0.5h       | High     |
| Request devnet SOL airdrop        | 0.5h       | High     |
| Generate mainnet wallet keypair   | 0.5h       | High     |
| Purchase and transfer mainnet SOL | 1h         | High     |
| Test connection to Solana devnet  | 1h         | High     |
| Test connection to Solana mainnet | 1h         | High     |
| Setup environment variables       | 1h         | High     |

**Deliverables:**

```bash
# Devnet wallet
- Public key: documented
- Private key: in .env.devnet
- Balance: 2 SOL (from airdrop)

# Mainnet wallet
- Public key: documented
- Private key: in .env.mainnet
- Balance: 0.5 SOL (purchased)

# Environment files
.env.devnet
.env.mainnet
```

**Commands:**

```bash
# Install dependencies
npm install @solana/web3.js bs58

# Generate wallet
node scripts/generate-wallet.js

# Check balance
node scripts/check-balance.js
```

---

### Milestone 1.2: Solana Client Implementation (Days 2-4)

**Objectives:**

- Implement SolanaClient class
- Create memo transactions
- Handle basic errors

**Tasks:**

| Task                                   | Est. Hours | Priority |
| -------------------------------------- | ---------- | -------- |
| Create src/clients/solana.js structure | 2h         | High     |
| Implement wallet loading               | 2h         | High     |
| Implement connection management        | 2h         | High     |
| Implement memo transaction creation    | 4h         | High     |
| Implement transaction sending          | 3h         | High     |
| Implement confirmation waiting         | 3h         | High     |
| Add basic error handling               | 2h         | High     |
| Add health check method                | 2h         | Medium   |
| Unit tests for Solana client           | 4h         | High     |

**Files to Create:**

```
src/
├── clients/
│   └── solana.js
├── config/
│   └── index.js (update)
tests/
└── unit/
    └── solanaClient.test.js
scripts/
├── generate-wallet.js
└── check-balance.js
```

**Code Skeleton:**

```javascript
class SolanaClient {
  constructor() {
    this.connection = new Connection(config.solana.rpcUrl);
    this.wallet = this.loadWallet();
  }

  loadWallet() {
    /* ... */
  }
  async checkHealth() {
    /* ... */
  }
  async recordBatch(batch, hash) {
    /* ... */
  }
  async verifyBatch(signature) {
    /* ... */
  }
  async getWalletBalance() {
    /* ... */
  }
}
```

**Testing:**

```javascript
// Test on devnet first
describe("SolanaClient (Devnet)", () => {
  test("connects to devnet", async () => {
    const health = await client.checkHealth();
    expect(health.healthy).toBe(true);
  });

  test("records batch to devnet", async () => {
    const result = await client.recordBatch(mockBatch, mockHash);
    expect(result.success).toBe(true);
    expect(result.signature).toBeDefined();
  });
});
```

**Deliverables:**

- ✅ SolanaClient class working on devnet
- ✅ Can send memo transactions
- ✅ Can verify transactions
- ✅ Unit tests pass

---

### Milestone 1.3: Database Schema Updates (Days 4-5)

**Objectives:**

- Add Solana-related columns to batches table
- Create indexes
- Test migrations

**Tasks:**

| Task                           | Est. Hours | Priority |
| ------------------------------ | ---------- | -------- |
| Write migration script         | 2h         | High     |
| Add solana_tx_signature column | 0.5h       | High     |
| Add solana_status column       | 0.5h       | High     |
| Add solana_retry_count column  | 0.5h       | High     |
| Add solana_last_error column   | 0.5h       | High     |
| Add solana_confirmed_at column | 0.5h       | High     |
| Create indexes                 | 1h         | High     |
| Test migration on dev database | 1h         | High     |
| Document rollback procedure    | 1h         | Medium   |

**Migration Script:**

```sql
-- scripts/migrations/003_add_solana_columns.sql
BEGIN;

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS solana_tx_signature VARCHAR(88),
  ADD COLUMN IF NOT EXISTS solana_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS solana_retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS solana_last_error TEXT,
  ADD COLUMN IF NOT EXISTS solana_confirmed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_batches_solana_status
  ON batches(solana_status);

CREATE INDEX IF NOT EXISTS idx_batches_solana_pending
  ON batches(solana_status, solana_retry_count)
  WHERE solana_status = 'pending';

COMMIT;
```

**Testing:**

```bash
# Run migration
psql -U bridge -d veep_bridge -f scripts/migrations/003_add_solana_columns.sql

# Verify columns
psql -U bridge -d veep_bridge -c "\d batches"

# Test rollback
psql -U bridge -d veep_bridge -f scripts/migrations/003_rollback.sql
```

**Deliverables:**

- ✅ Migration script tested
- ✅ New columns added
- ✅ Indexes created
- ✅ Rollback script ready

---

## 3. Week 2: Reliability & Retry Logic

### Milestone 2.1: Blockchain Service Implementation (Days 6-8)

**Objectives:**

- Create BlockchainService orchestrator
- Implement recording with fallback
- Add retry queue management

**Tasks:**

| Task                                     | Est. Hours | Priority |
| ---------------------------------------- | ---------- | -------- |
| Create src/services/blockchainService.js | 2h         | High     |
| Implement recordBatchWithFallback()      | 4h         | High     |
| Implement addToRetryQueue()              | 2h         | High     |
| Implement updateBatchSolanaStatus()      | 2h         | High     |
| Add metrics collection                   | 2h         | Medium   |
| Error categorization logic               | 3h         | High     |
| Integration with BatchProcessor          | 3h         | High     |
| Unit tests for BlockchainService         | 4h         | High     |

**Integration Point:**

```javascript
// src/services/batchProcessor.js
async completeBatch(reason) {
  // ... existing code ...

  // Store to database
  await storage.saveBatch(this.currentBatch, batchHash);

  // NEW: Record to blockchain (non-blocking)
  blockchainService.recordBatchWithFallback(
    this.currentBatch,
    batchHash
  ).catch(error => {
    logger.error('Blockchain recording failed', { error });
    // Don't throw - batch already saved to DB
  });

  // ... rest of code ...
}
```

**Testing:**

```javascript
describe("BlockchainService", () => {
  test("records batch successfully", async () => {
    const result = await service.recordBatchWithFallback(batch, hash);
    expect(result.success).toBe(true);
  });

  test("adds to queue on failure", async () => {
    mock.solana.simulateFailure();
    const result = await service.recordBatchWithFallback(batch, hash);
    expect(result.queued).toBe(true);

    const pending = await db.query(
      "SELECT * FROM batches WHERE solana_status = 'pending'"
    );
    expect(pending.rows.length).toBe(1);
  });
});
```

**Deliverables:**

- ✅ BlockchainService class functional
- ✅ Recording with fallback works
- ✅ Database updates correctly
- ✅ Tests pass

---

### Milestone 2.2: Retry Worker Implementation (Days 8-10)

**Objectives:**

- Implement retry worker
- Handle pending batches
- Max retries logic

**Tasks:**

| Task                                | Est. Hours | Priority |
| ----------------------------------- | ---------- | -------- |
| Implement startRetryWorker()        | 2h         | High     |
| Implement processRetryQueue()       | 4h         | High     |
| Add exponential backoff logic       | 2h         | Medium   |
| Add rate limiting between retries   | 2h         | Medium   |
| Implement max retries (10) handling | 2h         | High     |
| Add retry statistics tracking       | 2h         | Medium   |
| Health check during retries         | 2h         | High     |
| Integration tests for retry         | 4h         | High     |

**Retry Worker Logic:**

```javascript
startRetryWorker() {
  // Run every 5 minutes
  setInterval(async () => {
    if (this.isProcessingRetries) return;

    this.isProcessingRetries = true;
    try {
      await this.processRetryQueue();
    } finally {
      this.isProcessingRetries = false;
    }
  }, 5 * 60 * 1000);
}

async processRetryQueue() {
  // Get pending (max 10 per run)
  const pending = await getPendingBatches(10);

  // Check Solana health
  if (!solanaClient.isHealthy) {
    logger.warn('Solana unhealthy, skipping retry');
    return;
  }

  // Process each
  for (const batch of pending) {
    await sleep(1000); // Rate limit
    await retryBatch(batch);
  }
}
```

**Testing Scenarios:**

```javascript
// Scenario 1: Success on retry
test("retry succeeds after initial failure", async () => {
  // Create failed batch
  await createFailedBatch();

  // Run retry worker
  await retryWorker.processRetryQueue();

  // Verify success
  const batch = await getBatch(batchId);
  expect(batch.solana_status).toBe("confirmed");
});

// Scenario 2: Max retries reached
test("marks as failed after 10 retries", async () => {
  // Create batch with 9 retries
  await createBatchWithRetries(9);

  // Simulate failure
  mock.solana.fail();

  // Run retry
  await retryWorker.processRetryQueue();

  // Verify failed
  const batch = await getBatch(batchId);
  expect(batch.solana_status).toBe("failed");
  expect(batch.solana_retry_count).toBe(10);
});
```

**Deliverables:**

- ✅ Retry worker running
- ✅ Pending batches processed
- ✅ Max retries enforced
- ✅ Tests cover all scenarios

---

### Milestone 2.3: Verification API (Days 10-12)

**Objectives:**

- Add verification endpoints
- Create public verification page
- Test verification flow

**Tasks:**

| Task                                          | Est. Hours | Priority |
| --------------------------------------------- | ---------- | -------- |
| Add GET /api/v1/batches/:id/blockchain        | 3h         | High     |
| Add POST /api/v1/batches/:id/retry-blockchain | 2h         | Medium   |
| Add GET /api/v1/blockchain/health             | 2h         | High     |
| Add GET /api/v1/blockchain/stats              | 2h         | Medium   |
| Create GET /verify/:batchId page              | 4h         | High     |
| Add Solana Explorer links                     | 1h         | High     |
| Add verification logic                        | 3h         | High     |
| API tests for new endpoints                   | 3h         | High     |

**Verification Page (Simple HTML):**

```html
<!-- public/verify.html -->

VEEP Batch Verification /* Simple, clean styling */ Blockchain Verification //
Fetch and display verification result
fetch(`/api/v1/batches/${batchId}/blockchain`) .then(r => r.json()) .then(data
=> displayResult(data));
```

**Deliverables:**

- ✅ Verification endpoints working
- ✅ Public verification page functional
- ✅ Explorer links generated correctly
- ✅ API tests pass

---

## 4. Week 3: Production Readiness & Testing

### Milestone 3.1: Monitoring & Metrics (Days 13-15)

**Objectives:**

- Add comprehensive metrics
- Setup alerting rules
- Create monitoring dashboard

**Tasks:**

| Task                                 | Est. Hours | Priority |
| ------------------------------------ | ---------- | -------- |
| Add blockchain metrics to Prometheus | 3h         | High     |
| Create Grafana dashboard (optional)  | 4h         | Low      |
| Implement wallet balance alerts      | 2h         | High     |
| Implement transaction failure alerts | 2h         | High     |
| Implement cost tracking              | 3h         | Medium   |
| Add retry queue size metric          | 2h         | High     |
| Add success rate calculation         | 2h         | High     |
| Document alerting thresholds         | 2h         | Medium   |

**Metrics to Add:**

```javascript
// Counters
blockchain_transactions_sent_total;
blockchain_transactions_confirmed_total;
blockchain_transactions_failed_total;
blockchain_retries_total;

// Gauges
blockchain_pending_count;
blockchain_wallet_balance_sol;
blockchain_failed_count;

// Histograms
blockchain_confirmation_duration_seconds;
blockchain_transaction_cost_sol;
```

**Alert Rules:**

```yaml
# alerts.yml
- alert: WalletBalanceLow
  expr: blockchain_wallet_balance_sol < 0.1
  for: 5m
  severity: warning

- alert: WalletBalanceCritical
  expr: blockchain_wallet_balance_sol < 0.05
  for: 1m
  severity: critical

- alert: HighTransactionFailureRate
  expr: rate(blockchain_transactions_failed_total[5m]) > 0.1
  for: 10m
  severity: warning

- alert: RetryQueueGrowing
  expr: blockchain_pending_count > 100
  for: 30m
  severity: warning
```

**Deliverables:**

- ✅ All metrics implemented
- ✅ Alerts configured
- ✅ Dashboard created (optional)
- ✅ Monitoring validated

---

### Milestone 3.2: Load & Failure Testing (Days 15-17)

**Objectives:**

- Test under load
- Test failure scenarios
- Validate retry mechanism

**Tasks:**

| Task                                    | Est. Hours | Priority |
| --------------------------------------- | ---------- | -------- |
| Setup load testing environment          | 2h         | High     |
| Test recording 100 batches continuously | 3h         | High     |
| Test during Solana mainnet congestion   | 2h         | High     |
| Simulate RPC failures                   | 2h         | High     |
| Simulate wallet insufficient balance    | 2h         | High     |
| Test service restart with pending queue | 2h         | High     |
| Test max retries scenario               | 2h         | High     |
| Document test results                   | 2h         | Medium   |

**Load Test Script:**

```javascript
// scripts/load-test.js
async function loadTest() {
  const batches = generateTestBatches(100);

  const results = {
    sent: 0,
    confirmed: 0,
    failed: 0,
    avgTime: 0,
  };

  for (const batch of batches) {
    const start = Date.now();
    const result = await blockchainService.recordBatchWithFallback(batch);

    if (result.success) {
      results.confirmed++;
      results.avgTime += Date.now() - start;
    } else {
      results.failed++;
    }
    results.sent++;

    await sleep(100); // 10 tx/sec
  }

  console.log("Load Test Results:", results);
}
```

**Failure Scenarios:**

```javascript
// Test 1: RPC down
test("handles RPC failure gracefully", async () => {
  mock.rpc.simulateDown();
  const result = await service.recordBatchWithFallback(batch);
  expect(result.queued).toBe(true);
});

// Test 2: Transaction timeout
test("handles transaction timeout", async () => {
  mock.solana.simulateTimeout();
  const result = await service.recordBatchWithFallback(batch);
  expect(result.queued).toBe(true);
});

// Test 3: Service restart
test("persists pending queue across restarts", async () => {
  await createPendingBatches(5);
  await service.stop();
  await service.start();

  const pending = await getPendingBatches();
  expect(pending.length).toBe(5);
});
```

**Deliverables:**

- ✅ Load tests pass (100+ batches)
- ✅ All failure scenarios handled
- ✅ No data loss under any scenario
- ✅ Test report documented

---

### Milestone 3.3: Security Audit (Days 17-18)

**Objectives:**

- Audit private key handling
- Audit memo data
- Security review

**Tasks:**

| Task                               | Est. Hours | Priority |
| ---------------------------------- | ---------- | -------- |
| Review private key storage         | 2h         | High     |
| Review logging for sensitive data  | 2h         | High     |
| Review memo data content           | 2h         | High     |
| Test key rotation procedure        | 2h         | Medium   |
| Review error messages              | 1h         | Medium   |
| Document security practices        | 2h         | High     |
| Third-party code review (optional) | 4h         | Low      |

**Security Checklist:**

```markdown
- [ ] Private key not in code
- [ ] Private key not in Git
- [ ] Private key not in logs
- [ ] Private key not in error messages
- [ ] Memo data contains no sensitive info
- [ ] No device IDs in memo
- [ ] No raw data in memo
- [ ] Wallet balance alerts work
- [ ] Transaction size limits enforced
- [ ] Rate limiting in place
```

**Deliverables:**

- ✅ Security checklist completed
- ✅ No sensitive data leaks
- ✅ Key rotation procedure documented
- ✅ Security review passed

---

## 5. Week 4: Deployment & Documentation

### Milestone 4.1: Mainnet Deployment (Days 19-21)

**Objectives:**

- Deploy to production
- Switch from devnet to mainnet
- Monitor initial transactions

**Tasks:**

| Task                                 | Est. Hours | Priority |
| ------------------------------------ | ---------- | -------- |
| Final code review                    | 3h         | High     |
| Update config for mainnet            | 1h         | High     |
| Deploy database migrations           | 1h         | High     |
| Deploy code to production            | 2h         | High     |
| Monitor first 24 hours               | 8h         | High     |
| Verify first transactions on mainnet | 2h         | High     |
| Setup monitoring alerts              | 2h         | High     |
| Create runbook for operations        | 3h         | High     |

**Deployment Checklist:**

```bash
# 1. Database migration
psql -U bridge -d veep_bridge -f scripts/migrations/003_add_solana_columns.sql

# 2. Environment variables
export SOLANA_PRIVATE_KEY="mainnet_private_key"
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"

# 3. Verify wallet balance
node scripts/check-balance.js

# 4. Deploy code
git pull origin main
npm install
npm run build

# 5. Restart service
pm2 restart bridge-service

# 6. Monitor logs
tail -f logs/combined.log | grep blockchain

# 7. Check first transaction
curl http://localhost:3000/api/v1/blockchain/stats
```

**Initial Monitoring (24 hours):**

- Transaction success rate
- Confirmation times
- Wallet balance
- Retry queue size
- Error rates

**Deliverables:**

- ✅ Production deployment successful
- ✅ Mainnet transactions working
- ✅ Monitoring active
- ✅ No critical issues

---

### Milestone 4.2: Documentation (Days 21-23)

**Objectives:**

- Complete user documentation
- Create operational guides
- Write customer verification guide

**Tasks:**

| Task                              | Est. Hours | Priority |
| --------------------------------- | ---------- | -------- |
| Write customer verification guide | 4h         | High     |
| Write operations runbook          | 4h         | High     |
| Document wallet top-up procedure  | 2h         | High     |
| Document troubleshooting guide    | 3h         | High     |
| Create API documentation          | 3h         | High     |
| Write cost monitoring guide       | 2h         | Medium   |
| Record demo video (optional)      | 2h         | Low      |

**Documentation Deliverables:**

```
docs/
├── BLOCKCHAIN_INTEGRATION.md    # Overview
├── CUSTOMER_VERIFICATION.md     # For customers
├── OPERATIONS_RUNBOOK.md        # For ops team
├── TROUBLESHOOTING.md           # Common issues
├── API_BLOCKCHAIN.md            # API reference
└── COST_MONITORING.md           # Cost tracking
```

**Customer Verification Guide (Example):**

```markdown
# How to Verify Your Data on Blockchain

1. Receive your batch report with Blockchain info:

   - Batch ID: 550e8400-e29b-41d4-a716-446655440000
   - Batch Hash: a3f5e9b2c1d8f7e6...
   - Solana TX: 5j7s8dH3kS9...

2. Visit verification page:
   https://your-service.com/verify/550e8400...

3. See blockchain proof:

   - Status: ✓ Confirmed
   - Transaction: 5j7s8dH3kS9...
   - Block Time: 2025-10-01 10:05:00 UTC
   - Explorer Link: [View on Solana Explorer]

4. Click Explorer link to see public transaction

5. Verify hash matches your report
```

**Deliverables:**

- ✅ All documentation complete
- ✅ Customer guide tested
- ✅ Operations runbook validated
- ✅ Demo video recorded (optional)

---

### Milestone 4.3: Training & Handoff (Days 23-24)

**Objectives:**

- Train operations team
- Knowledge transfer
- Final sign-off

**Tasks:**

| Task                     | Est. Hours | Priority |
| ------------------------ | ---------- | -------- |
| Operations team training | 4h         | High     |
| Demo to stakeholders     | 2h         | High     |
| Q&A session              | 2h         | High     |
| Final code review        | 2h         | High     |
| Project retrospective    | 2h         | Medium   |
| Sign-off meeting         | 2h         | High     |

**Training Topics:**

- How blockchain integration works
- Monitoring dashboard overview
- How to check wallet balance
- How to top-up wallet
- How to handle alerts
- Troubleshooting common issues
- Customer support for verification

**Demo Script:**

```
1. Show Bridge Service creating batches
2. Show blockchain recording in real-time
3. Show Solana Explorer transaction
4. Demonstrate customer verification
5. Show monitoring dashboard
6. Walk through failure scenario and recovery
7. Show cost tracking
```

**Deliverables:**

- ✅ Team trained
- ✅ Demo successful
- ✅ Documentation handed off
- ✅ Project signed off

---

## 6. Risk Management

### 6.1 Technical Risks

| Risk                       | Mitigation                 | Contingency                 |
| -------------------------- | -------------------------- | --------------------------- |
| Solana mainnet instability | Test thoroughly on devnet  | Retry queue handles outages |
| Transaction costs spike    | Monitor costs, set alerts  | Increase batch size         |
| Wallet compromised         | Secure storage, monitoring | Rotate keys immediately     |
| RPC rate limiting          | Use fallback RPC           | Upgrade to paid RPC         |

### 6.2 Schedule Risks

| Risk                   | Mitigation                   | Contingency                |
| ---------------------- | ---------------------------- | -------------------------- |
| Solana SDK issues      | Start early, test thoroughly | Use alternative approaches |
| Integration complexity | Regular testing              | Cut scope if needed        |
| Testing takes longer   | Start testing early          | Extend timeline            |

---

## 7. Success Metrics

**End of Week 1:**

- ✅ Can record to Solana devnet
- ✅ Basic verification works

**End of Week 2:**

- ✅ Retry mechanism functional
- ✅ 95%+ success rate on devnet

**End of Week 3:**

- ✅ All tests pass
- ✅ Security audit complete

**End of Week 4:**

- ✅ Production deployment successful
- ✅ Documentation complete
- ✅ Team trained

**Overall Success:**

- 95%+ transactions confirmed
- Average confirmation < 60 seconds
- No data loss
- Daily cost < $5
- Customer can verify independently

---

## Document Approval

| Role            | Name        | Date    | Status |
| --------------- | ----------- | ------- | ------ |
| Project Manager | [Your Name] | 2025-10 | Draft  |
| Technical Lead  | TBD         | -       | -      |

---

**Next Document:** Setup Guide
