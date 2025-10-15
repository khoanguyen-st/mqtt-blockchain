# Blockchain Scheduler - Documentation

## 📋 Overview

BlockchainScheduler tự động ghi các batch lên Solana blockchain theo lịch trình cố định mỗi 3 tiếng một lần, bắt đầu từ 0h hàng ngày.

## ⏰ Lịch Trình

### Schedule Pattern

Scheduler chạy vào các khung giờ sau mỗi ngày:

- **00:00** (nửa đêm)
- **03:00** (3 giờ sáng)
- **06:00** (6 giờ sáng)
- **09:00** (9 giờ sáng)
- **12:00** (12 giờ trưa)
- **15:00** (3 giờ chiều)
- **18:00** (6 giờ tối)
- **21:00** (9 giờ tối)

**Tổng: 8 lần recording mỗi ngày**

### Time Windows

Mỗi lần chạy, scheduler sẽ record tất cả các batch được tạo trong khung 3 tiếng trước đó:

- 0h record: batches từ 21h-0h
- 3h record: batches từ 0h-3h
- 6h record: batches từ 3h-6h
- ... và cứ thế tiếp tục

## 🏗️ Architecture

### Flow Diagram

```
MQTT Messages → BatchProcessor → PostgreSQL
                                      ↓
                                [Pending Batches]
                                      ↓
        BlockchainScheduler ← (Every 3 hours) ← Cron Job
                ↓
        Record to Solana
                ↓
        Update Status → [Confirmed Batches]
```

### Component Interaction

```javascript
// 1. Batch được tạo và lưu vào database
BatchProcessor.completeBatch()
  → saveBatch()
  → PostgreSQL (solana_status = 'pending')

// 2. Scheduler chạy theo lịch (mỗi 3 tiếng)
BlockchainScheduler.recordBatchesToBlockchain()
  → Get batches in time window
  → blockchainService.recordBatchWithFallback()
  → Solana blockchain
  → Update database (solana_status = 'confirmed')
```

## ⚙️ Configuration

### Environment Variables

```bash
# Enable/disable blockchain integration
SOLANA_ENABLED=true

# Enable/disable scheduler (default: true)
BLOCKCHAIN_SCHEDULE_ENABLED=true

# Record pending batches immediately on startup (default: false)
BLOCKCHAIN_RECORD_ON_STARTUP=false

# Retry configuration
BLOCKCHAIN_RETRY_INTERVAL_MS=300000  # 5 minutes
BLOCKCHAIN_MAX_RETRIES=10
```

### Config Object (`src/config/index.js`)

```javascript
blockchain: {
  retryIntervalMs: 300000,           // Retry failed batches every 5 minutes
  maxRetries: 10,                    // Max retry attempts before marking as failed
  recordOnStartup: false,            // Record pending batches on app startup
  scheduleEnabled: true,             // Enable 3-hour scheduling
}
```

## 🚀 Usage

### Starting the Service

```bash
# Start application with scheduler
npm start
```

**Logs khi khởi động:**

```
{"msg":"BlockchainService started","network":"devnet"}
{"msg":"BlockchainScheduler started","schedule":"Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)","nextRun":"2025-10-09T03:00:00.000Z"}
```

### Testing the Scheduler

```bash
# Run test script
./scripts/devnet.sh node scripts/test-scheduler.js
```

**Test script sẽ:**

1. Initialize BlockchainService
2. Display scheduler status
3. Create 5 test batches
4. Check pending batches
5. Trigger manual recording
6. Verify results

## 📡 API Endpoints

### GET /api/v1/blockchain/scheduler

Lấy thông tin trạng thái scheduler

```bash
curl http://localhost:3000/api/v1/blockchain/scheduler
```

**Response:**

```json
{
  "isRunning": true,
  "lastRecordTime": "2025-10-09T00:05:30.000Z",
  "recordedBatches": 125,
  "nextRunTime": "2025-10-09T03:00:00.000Z",
  "currentTimeWindow": {
    "start": "2025-10-09T00:00:00.000Z",
    "end": "2025-10-09T03:00:00.000Z"
  },
  "schedule": "Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)"
}
```

### POST /api/v1/blockchain/scheduler/trigger

Kích hoạt recording thủ công (không cần đợi lịch trình)

```bash
curl -X POST http://localhost:3000/api/v1/blockchain/scheduler/trigger
```

**Response:**

```json
{
  "success": true,
  "message": "Manual blockchain recording triggered",
  "stats": {
    "isRunning": true,
    "recordedBatches": 130,
    "nextRunTime": "2025-10-09T03:00:00.000Z"
  }
}
```

**Use Cases cho Manual Trigger:**

- Testing sau khi deploy
- Emergency recording khi có nhiều pending batches
- Recovery sau downtime
- Debugging issues

## 🔍 Monitoring

### Check Scheduler Status

```bash
# Via API
curl http://localhost:3000/api/v1/blockchain/scheduler | jq

# Via Database
./scripts/devnet.sh node -e "
const db = require('./src/clients/database');
db.getPool().query(\`
  SELECT
    solana_status,
    COUNT(*) as count,
    MAX(created_at) as latest
  FROM batches
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY solana_status
\`)
.then(r => console.table(r.rows))
.then(() => process.exit(0));
"
```

### Check Pending Batches

```sql
-- Batches chờ recording trong time window hiện tại
SELECT batch_id, message_count, created_at, solana_retry_count
FROM batches
WHERE solana_status = 'pending'
  AND created_at >= date_trunc('hour', NOW() - INTERVAL '3 hours')
  AND created_at < date_trunc('hour', NOW())
ORDER BY created_at ASC;
```

### Logs to Monitor

**Scheduler started:**

```json
{
  "msg": "BlockchainScheduler started",
  "schedule": "Every 3 hours (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h)",
  "nextRun": "2025-10-09T03:00:00.000Z"
}
```

**Recording triggered:**

```json
{
  "msg": "Starting scheduled blockchain recording...",
  "windowStart": "2025-10-09T00:00:00.000Z",
  "windowEnd": "2025-10-09T03:00:00.000Z"
}
```

**Recording completed:**

```json
{
  "msg": "Scheduled blockchain recording completed",
  "totalBatches": 15,
  "successCount": 14,
  "failCount": 1,
  "durationMs": 18500,
  "nextRun": "2025-10-09T03:00:00.000Z"
}
```

## 🎯 Benefits

### Cost Optimization

- **Batch recording**: Thay vì record ngay lập tức, gom các batch lại record cùng lúc
- **Reduce RPC calls**: Giảm số lần call RPC endpoint
- **Lower transaction fees**: Ít transactions hơn = chi phí thấp hơn

### Performance Improvement

- **Non-blocking**: Batch completion không bị delay bởi blockchain recording
- **Predictable load**: Transaction load phân bổ đều trong ngày
- **Rate limit friendly**: Tránh vượt quá RPC rate limits

### Reliability

- **Retry mechanism**: Tự động retry các batches failed
- **Time-based recovery**: Mỗi 3 tiếng là một cơ hội retry
- **Manual override**: Có thể trigger recording thủ công khi cần

## ⚠️ Important Notes

### Batch Status Flow

```
Created → pending (lưu vào DB)
    ↓
Scheduled Recording (mỗi 3 tiếng)
    ↓
sent → (đang gửi lên Solana)
    ↓
confirmed → (đã confirm trên blockchain)
```

### Retry Logic

```
pending → Record attempt 1 → Failed → pending (retry_count = 1)
    ↓
5 minutes later → Retry attempt 2 → Failed → pending (retry_count = 2)
    ↓
... (max 10 retries)
    ↓
After 10 failures → failed (stopped retrying)
```

### Time Windows

Batches được record dựa trên `created_at` timestamp:

- **Inclusive start**: `created_at >= window_start`
- **Exclusive end**: `created_at < window_end`

Example:

- Window: 0h-3h
- Batch created at 02:59:59 → ✅ Included
- Batch created at 03:00:00 → ❌ Not included (next window)

## 🛠️ Troubleshooting

### Issue: Scheduler không chạy

**Check:**

```bash
# 1. Verify configuration
echo $BLOCKCHAIN_SCHEDULE_ENABLED  # Should be 'true' or empty

# 2. Check logs
docker-compose logs app | grep -i scheduler

# 3. Check API
curl http://localhost:3000/api/v1/blockchain/scheduler
```

**Solutions:**

- Ensure `SOLANA_ENABLED=true`
- Ensure `BLOCKCHAIN_SCHEDULE_ENABLED` not set to 'false'
- Restart application

### Issue: Batches không được record

**Check:**

```bash
# Check pending batches
curl http://localhost:3000/api/v1/blockchain/stats

# Trigger manual recording
curl -X POST http://localhost:3000/api/v1/blockchain/scheduler/trigger

# Check blockchain service health
curl http://localhost:3000/api/v1/blockchain/health
```

**Common causes:**

- Wallet balance too low
- RPC endpoint unreachable
- Invalid private key
- Network issues

### Issue: High failure rate

**Check:**

```sql
SELECT
  solana_last_error,
  COUNT(*) as count
FROM batches
WHERE solana_status = 'failed'
GROUP BY solana_last_error;
```

**Solutions:**

- Check RPC rate limits
- Verify wallet has sufficient SOL
- Use paid RPC provider
- Increase `BLOCKCHAIN_RETRY_INTERVAL_MS`

## 📊 Performance Considerations

### Expected Load

**Per 3-hour window:**

- Batches created: ~180 (assuming 1 batch per minute)
- Recording time: ~3 minutes (1 second per batch)
- Transaction cost: ~0.0009 SOL (180 × 0.000005 SOL)

**Per day:**

- Total batches: ~1440
- Total transactions: ~1440
- Total cost: ~0.0072 SOL (~$0.18 at $25/SOL)

### Optimization Tips

**1. Adjust batch size to reduce number of batches:**

```bash
BATCH_SIZE=2000  # Larger batches = fewer records to blockchain
```

**2. Increase recording frequency if needed:**

```javascript
// Change cron pattern in blockchainScheduler.js
// Every 6 hours instead of 3:
this.cronJob = cron.schedule('0 */6 * * *', ...);
```

**3. Use paid RPC for better reliability:**

```bash
SOLANA_RPC_URL=https://api.alchemy.com/v2/your-api-key
```

## 🔐 Security Notes

- **Private key**: Scheduler uses same wallet as BlockchainService
- **Rate limiting**: Adds 1-second delay between transactions
- **Error handling**: Failed batches don't stop the scheduler
- **Graceful shutdown**: Stops cleanly on SIGINT/SIGTERM

## 📚 References

- **Cron Pattern**: [node-cron documentation](https://github.com/node-cron/node-cron)
- **Solana Transactions**: [Solana Cookbook](https://solanacookbook.com/)
- **Best Practices**: See `docs/TECHNICAL-GUIDE.md`

---

**Last Updated**: October 9, 2025
**Version**: 1.0
**Author**: Development Team
