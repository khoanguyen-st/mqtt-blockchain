# System Requirements - Solana Blockchain Integration

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Phase:** Solana Integration (Post Bridge Service PoC)

---

## 1. Overview

### 1.1 Purpose

Integrate Solana blockchain to provide transparent, immutable proof of IoT data batches, giving customers ability to independently verify data integrity without trusting the service provider.

### 1.2 Business Goals

- **Transparency**: Customers can verify data hasn't been tampered with
- **Competitive Advantage**: Differentiate from traditional IoT monitoring (e.g., electric meters)
- **Trust**: Build confidence through blockchain-backed proof
- **Marketing**: "Blockchain-secured IoT data"

### 1.3 Prerequisites

- ✅ Bridge Service PoC completed and working
- ✅ MQTT → Batching → PostgreSQL flow stable
- ✅ API endpoints functional
- ✅ At least 1 week of test data collected

---

## 2. Functional Requirements

### 2.1 Blockchain Recording

**FR-001: Batch Hash Recording**

- MUST record batch hash to Solana blockchain using Memo transactions
- MUST include: batch ID, hash, message count, timestamps
- MUST record within 1 minute of batch completion
- SHOULD be non-blocking (don't delay batch processing)

**FR-002: Transaction Confirmation**

- MUST wait for transaction confirmation (commitment level: 'confirmed')
- MUST store transaction signature in database
- MUST handle transaction failures gracefully

**FR-003: Retry Mechanism**

- MUST retry failed transactions automatically
- MUST retry up to 10 times with exponential backoff
- MUST wait 5 minutes between retries
- MUST mark as 'failed' after max retries

### 2.2 Wallet Management

**FR-004: Wallet Security**

- MUST store private key securely (not in code)
- MUST load from environment variable
- SHOULD use base58 encoding for private key
- MUST NOT expose private key in logs or API responses

**FR-005: Balance Monitoring**

- MUST check wallet balance on startup
- MUST alert when balance < 0.1 SOL
- SHOULD log balance in health checks
- MUST prevent transactions if insufficient balance

**FR-006: Wallet Top-up Process**

- MUST document manual top-up procedure
- SHOULD provide CLI tool to check balance
- MUST log when top-up is needed

### 2.3 Verification

**FR-007: Blockchain Verification API**

- MUST provide endpoint to verify batch on blockchain
- MUST return: transaction signature, block time, memo data
- MUST handle "not yet confirmed" state
- SHOULD provide Solana Explorer link

**FR-008: Customer Verification Portal**

- SHOULD provide simple web page for verification
- MUST show: batch info, blockchain proof, explorer link
- MUST work without authentication (public verification)

### 2.4 Monitoring & Observability

**FR-009: Blockchain Metrics**

- MUST track: transactions sent, confirmed, failed
- MUST track: retry count, average confirmation time
- MUST track: wallet balance
- SHOULD expose Prometheus metrics

**FR-010: Health Monitoring**

- MUST check Solana RPC connectivity
- MUST report blockchain service status in /health endpoint
- MUST log all blockchain errors
- SHOULD alert on repeated failures

---

## 3. Non-Functional Requirements

### 3.1 Performance

**NFR-001: Transaction Speed**

- Target: Record to blockchain within 60 seconds of batch completion
- Transaction confirmation: < 30 seconds (Solana average)
- Retry delay: 5 minutes minimum

**NFR-002: Throughput**

- Must handle recording 8,640 batches/day (1 batch/10 seconds)
- No backpressure on batch processor
- Retry queue must not grow unbounded

### 3.2 Reliability

**NFR-003: Data Consistency**

- Batch MUST be saved to database even if blockchain fails
- Blockchain failure MUST NOT prevent data processing
- Retry queue MUST survive service restarts

**NFR-004: Uptime Independence**

- Service MUST continue working during Solana outages
- Queued transactions MUST be retried when Solana recovers
- No data loss during blockchain downtime

### 3.3 Cost Management

**NFR-005: Transaction Costs**

- Target cost: ~$0.00025 per batch
- Expected cost: $2-3/day for 8,640 batches
- Maximum acceptable cost: $10/day
- Must alert if daily cost exceeds $5

**NFR-006: Wallet Balance**

- Minimum balance: 0.1 SOL (~$15-20)
- Recommended balance: 0.5 SOL (covers ~2000 transactions)
- Alert threshold: 0.1 SOL
- Critical threshold: 0.05 SOL

### 3.4 Security

**NFR-007: Private Key Security**

- Private key MUST be stored in environment variable
- Private key MUST NOT be committed to Git
- Private key MUST NOT appear in logs
- Consider using KMS for production

**NFR-008: Transaction Security**

- Memo data MUST NOT contain sensitive information
- Only batch metadata (hashes, counts) on blockchain
- Raw IoT data stays in PostgreSQL/S3

---

## 4. Technical Constraints

### 4.1 Technology Stack

| Component        | Technology       | Version | Purpose                |
| ---------------- | ---------------- | ------- | ---------------------- |
| Blockchain       | Solana Mainnet   | -       | Immutable data proof   |
| Solana SDK       | @solana/web3.js  | ^1.87.0 | Blockchain interaction |
| Encoding         | bs58             | ^5.0.0  | Key encoding           |
| RPC Provider     | Mainnet-beta     | -       | Public RPC endpoint    |
| Transaction Type | Memo Transaction | -       | Data recording         |

### 4.2 Solana Specifics

**RPC Endpoints:**

- Primary: `https://api.mainnet-beta.solana.com` (free, rate limited)
- Backup options: Helius, QuickNode, Alchemy (paid, faster)
- For PoC: Use free public RPC

**Transaction Settings:**

- Commitment level: `confirmed` (balance of speed vs finality)
- Max retries: 3 (built into SDK)
- Timeout: 30 seconds
- Preflight checks: Enabled

**Memo Program:**

- Program ID: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
- Built-in Solana program
- No deployment needed
- No custom smart contract

---

## 5. Data Requirements

### 5.1 Database Schema Updates

```sql
-- Add to batches table
ALTER TABLE batches ADD COLUMN IF NOT EXISTS
  solana_tx_signature VARCHAR(88),
  solana_status VARCHAR(20) DEFAULT 'pending',
  solana_retry_count INTEGER DEFAULT 0,
  solana_last_error TEXT,
  solana_confirmed_at TIMESTAMP WITH TIME ZONE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batches_solana_status
  ON batches(solana_status);

CREATE INDEX IF NOT EXISTS idx_batches_solana_pending
  ON batches(solana_status)
  WHERE solana_status = 'pending';
```

### 5.2 Solana Status Values

| Status      | Description                        | Next Action           |
| ----------- | ---------------------------------- | --------------------- |
| `pending`   | Awaiting blockchain recording      | Send transaction      |
| `sent`      | Transaction sent, awaiting confirm | Wait for confirmation |
| `confirmed` | Successfully recorded              | None (terminal state) |
| `failed`    | Max retries exceeded               | Manual intervention   |
| `skipped`   | Intentionally not recorded         | None (terminal state) |

### 5.3 Memo Data Format

```json
{
  "type": "VERIOT_BATCH",
  "version": "1.0",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "batchHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7...",
  "messageCount": 1000,
  "startTimestamp": "2025-10-01T10:00:00.000Z",
  "endTimestamp": "2025-10-01T10:05:00.000Z",
  "timestamp": "2025-10-01T10:05:01.000Z"
}
```

**Size limit:** 566 bytes (Solana memo max)

---

## 6. Integration Points

### 6.1 With Bridge Service

```
BatchProcessor.completeBatch()
  ├─ Generate batch hash
  ├─ Save to PostgreSQL (existing)
  └─ NEW: Record to Solana (async, non-blocking)
      ├─ Success → Update DB with signature
      └─ Failure → Add to retry queue
```

### 6.2 API Endpoints (New)

```
GET  /api/v1/batches/:id/blockchain     - Blockchain verification
POST /api/v1/batches/:id/retry-blockchain - Manual retry
GET  /api/v1/blockchain/health          - Solana health status
GET  /api/v1/blockchain/stats           - Statistics
GET  /verify/:batchId                   - Public verification page
```

---

## 7. Operational Requirements

### 7.1 Wallet Setup

**One-time setup:**

1. Generate Solana keypair
2. Fund wallet with 0.5 SOL (~$75-100)
3. Store private key in environment variable
4. Document public key for auditing

**Ongoing:**

- Monitor balance daily
- Top-up when < 0.1 SOL
- Budget ~$60-90/month for transactions

### 7.2 Monitoring Requirements

**Must monitor:**

- Wallet balance (alert < 0.1 SOL)
- Transaction success rate (alert < 95%)
- Retry queue size (alert > 100 pending)
- Daily cost (alert > $5)
- RPC health (alert on repeated failures)

**Dashboards:**

- Blockchain transaction metrics
- Retry queue status
- Cost tracking
- Wallet balance history

### 7.3 Backup & Recovery

**Wallet backup:**

- Private key must be backed up securely
- Document recovery procedure
- Test recovery process

**Retry queue persistence:**

- Retry queue survives service restart
- Database stores pending transactions
- No transactions lost during downtime

---

## 8. Risk Management

### 8.1 Technical Risks

| Risk                  | Probability | Impact   | Mitigation                                    |
| --------------------- | ----------- | -------- | --------------------------------------------- |
| Solana network outage | Medium      | Medium   | Retry queue, continue data processing         |
| Transaction failures  | Medium      | Low      | Automatic retry with exponential backoff      |
| Wallet drained (bug)  | Low         | High     | Balance monitoring, rate limiting             |
| Private key leaked    | Low         | Critical | Secure storage, no logging, KMS consideration |
| RPC rate limiting     | Medium      | Low      | Use fallback RPC endpoints                    |
| Cost spike            | Low         | Medium   | Daily cost alerts, transaction limits         |

### 8.2 Business Risks

| Risk                               | Probability | Impact | Mitigation                                           |
| ---------------------------------- | ----------- | ------ | ---------------------------------------------------- |
| Blockchain not valued by customers | Medium      | High   | Provide clear verification docs, marketing materials |
| Maintenance burden                 | Medium      | Medium | Good monitoring, documentation                       |
| Regulatory issues                  | Low         | High   | Consult legal, data on-chain is metadata only        |

---

## 9. Success Criteria

### 9.1 Phase 1: Basic Integration (Week 1-2)

- ✅ Solana client connects successfully
- ✅ Can record batch to blockchain
- ✅ Transaction signature stored in database
- ✅ Basic verification works
- ✅ Wallet balance monitoring works

### 9.2 Phase 2: Reliability (Week 3)

- ✅ Retry mechanism functional
- ✅ Service works during Solana outages
- ✅ No data loss during blockchain failures
- ✅ Monitoring dashboards set up
- ✅ 95%+ transaction success rate

### 9.3 Phase 3: Production Ready (Week 4)

- ✅ Cost tracking implemented
- ✅ Customer verification portal live
- ✅ Documentation complete
- ✅ 1 week continuous operation without issues
- ✅ All alerts tested

---

## 10. Out of Scope

**For initial implementation:**

- ❌ Custom Solana smart contract (using memo instead)
- ❌ Token economics / DePIN rewards
- ❌ Multi-signature wallet
- ❌ Hardware security module (HSM) integration
- ❌ Advanced analytics dashboard
- ❌ Blockchain explorer integration beyond basic links
- ❌ Cross-chain support
- ❌ Automated wallet top-up

**Future considerations:**

- Advanced retry strategies (priority fees)
- Custom program for complex logic
- Token rewards for devices
- Integration with Helium Network

---

## 11. Acceptance Criteria

Integration is considered complete when:

1. ✅ 95%+ of batches successfully recorded to Solana
2. ✅ Average confirmation time < 60 seconds
3. ✅ Retry mechanism handles failures gracefully
4. ✅ Service continues working during Solana outages
5. ✅ Customer can verify batches via public portal
6. ✅ Wallet balance monitoring and alerts work
7. ✅ Daily cost < $5
8. ✅ No private key leaks in logs/code
9. ✅ Documentation allows customer to verify independently
10. ✅ System runs for 1 week processing 1000+ batches successfully

---

## 12. Testing Requirements

### 12.1 Functional Testing

- [ ] Record batch to Solana devnet
- [ ] Record batch to Solana mainnet
- [ ] Verify batch on blockchain
- [ ] Handle transaction failure
- [ ] Retry failed transaction
- [ ] Max retries reached
- [ ] Wallet balance monitoring
- [ ] RPC endpoint switching

### 12.2 Integration Testing

- [ ] Bridge Service → Solana flow
- [ ] Database consistency during failures
- [ ] Retry worker processes queue
- [ ] API verification endpoint
- [ ] Public verification portal

### 12.3 Load Testing

- [ ] Record 100 batches continuously
- [ ] Handle 10 concurrent transactions
- [ ] Retry queue with 100 pending
- [ ] Service restart with pending queue

### 12.4 Failure Testing

- [ ] Solana RPC down
- [ ] Transaction timeout
- [ ] Insufficient wallet balance
- [ ] Network congestion
- [ ] Service restart during transaction

---

## 13. Dependencies

### 13.1 External Dependencies

- Solana Mainnet uptime and availability
- Solana RPC endpoint (free tier rate limits)
- SOL token for gas fees
- npm packages: @solana/web3.js, bs58

### 13.2 Internal Dependencies

- Bridge Service fully functional
- PostgreSQL database with batches
- API server running
- Monitoring infrastructure (Prometheus)

### 13.3 Team Dependencies

- Access to purchase SOL (~$100 initial)
- DevOps for environment variable setup
- Marketing for customer verification docs

---

## 14. Timeline Estimate

**Total Duration:** 4 weeks

| Phase               | Duration | Description                        |
| ------------------- | -------- | ---------------------------------- |
| Research & Design   | 3 days   | Review docs, finalize approach     |
| Basic Integration   | 5 days   | Solana client, basic recording     |
| Retry Mechanism     | 4 days   | Retry logic, queue management      |
| Verification        | 3 days   | API endpoints, verification portal |
| Testing & Hardening | 5 days   | Load tests, failure scenarios      |
| Documentation       | 3 days   | Customer docs, operational guides  |
| Buffer              | 5 days   | Unexpected issues                  |

---

## 15. Budget Requirements

### 15.1 Initial Setup

| Item                   | Cost        | Notes                         |
| ---------------------- | ----------- | ----------------------------- |
| Initial SOL purchase   | $75-100     | 0.5 SOL                       |
| RPC service (optional) | $0          | Using free public RPC for PoC |
| **Total Initial**      | **$75-100** | One-time                      |

### 15.2 Monthly Operating Costs

| Item                 | Estimated Cost | Notes                         |
| -------------------- | -------------- | ----------------------------- |
| Transaction fees     | $60-90         | ~8,640 batches/day × $0.00025 |
| RPC service          | $0             | Free tier sufficient for PoC  |
| Wallet top-up buffer | $20            | Safety margin                 |
| **Total Monthly**    | **$80-110**    | Recurring                     |

### 15.3 Cost Optimization Options

**If costs are concern:**

1. Increase batch size (1000 → 5000 messages)
   - Reduces batches/day by 5x
   - Cost: $60/month → $12/month
2. Checkpoint approach (hourly instead of per-batch)
   - Record merkle root every hour
   - Cost: $60/month → $2/month
3. Use Solana devnet for testing (free)

---

## Document Approval

| Role           | Name        | Date    | Status |
| -------------- | ----------- | ------- | ------ |
| Technical Lead | [Your Name] | 2025-10 | Draft  |
| Product Owner  | TBD         | -       | -      |
| Finance        | TBD         | -       | -      |

---

**Next Document:** Technical Architecture - Solana Integration
