# Blockchain Scheduler - Quick Reference

## 🎯 Tóm Tắt

BlockchainScheduler tự động record các batch lên Solana blockchain **mỗi 3 tiếng một lần**, thay vì record ngay lập tức sau khi batch hoàn thành.

## ⏰ Lịch Trình

**8 lần mỗi ngày:**

- 00:00 | 03:00 | 06:00 | 09:00 | 12:00 | 15:00 | 18:00 | 21:00

## 💡 Lợi Ích

✅ **Tiết kiệm chi phí**: Giảm số lượng transactions  
✅ **Hiệu năng tốt hơn**: Batch processing không bị chậm bởi blockchain  
✅ **Tránh rate limit**: Phân bổ đều load lên RPC  
✅ **Dễ dự đoán**: Biết trước khi nào sẽ record

## 🚀 Sử Dụng

### Khởi động

```bash
npm start
```

### Kiểm tra trạng thái

```bash
curl http://localhost:3000/api/v1/blockchain/scheduler
```

### Trigger thủ công (không cần đợi lịch)

```bash
curl -X POST http://localhost:3000/api/v1/blockchain/scheduler/trigger
```

### Test

```bash
./scripts/devnet.sh node scripts/test-scheduler.js
```

## ⚙️ Configuration

```bash
# .env file
SOLANA_ENABLED=true                      # Bật blockchain
BLOCKCHAIN_SCHEDULE_ENABLED=true         # Bật scheduler (default: true)
BLOCKCHAIN_RECORD_ON_STARTUP=false       # Record ngay khi startup
BLOCKCHAIN_RETRY_INTERVAL_MS=300000      # Retry mỗi 5 phút
BLOCKCHAIN_MAX_RETRIES=10                # Tối đa 10 lần retry
```

## 📊 Hoạt Động

### Flow

```
1. MQTT → Batch → Database (status: pending)
2. Scheduler chạy mỗi 3 tiếng
3. Lấy tất cả batches trong time window
4. Record lên Solana → Update status: confirmed
5. Nếu lỗi → Retry sau 5 phút
```

### Time Windows

Mỗi lần chạy record batches trong 3 tiếng trước:

- **0h**: record batches từ 21h-0h
- **3h**: record batches từ 0h-3h
- **6h**: record batches từ 3h-6h
- ... và tiếp tục

## 🔍 Monitoring

```bash
# Xem trạng thái scheduler
curl http://localhost:3000/api/v1/blockchain/scheduler | jq

# Xem batch statistics
curl http://localhost:3000/api/v1/blockchain/stats | jq

# Check pending batches trong database
SELECT COUNT(*) FROM batches WHERE solana_status = 'pending';
```

## 📚 Chi Tiết

Xem full documentation: [`docs/BLOCKCHAIN-SCHEDULER.md`](./docs/BLOCKCHAIN-SCHEDULER.md)

---

**Lưu ý**: Nếu muốn record ngay lập tức (không đợi scheduler), có thể trigger thủ công qua API endpoint hoặc set `BLOCKCHAIN_RECORD_ON_STARTUP=true` để record pending batches khi khởi động.
