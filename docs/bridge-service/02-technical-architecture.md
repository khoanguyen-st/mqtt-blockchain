# Technical Architecture Document - MQTT Bridge Service PoC

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Scope:** Local Proof of Concept

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────┐
│  IoT Devices    │
│  (VEEP Sensors) │
└────────┬────────┘
         │ MQTT Publish
         ▼
┌─────────────────────┐
│ Mosquitto Broker    │
│ (Existing)          │
└────────┬────────────┘
         │ MQTT Subscribe
         ▼
┌─────────────────────────────────────┐
│     Bridge Service (New)            │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  MQTT Client                 │  │
│  │  - Subscribe to topics       │  │
│  │  - Parse messages            │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │  Message Queue (Redis)       │  │
│  │  - Buffer incoming messages  │  │
│  │  - Persist for reliability   │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │  Batch Processor             │  │
│  │  - Group messages            │  │
│  │  - Trigger by size/time      │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │  Hash Generator              │  │
│  │  - SHA-256 batch hash        │  │
│  │  - Message hashes            │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │  Storage Service             │  │
│  │  - Write to PostgreSQL       │  │
│  │  - Store raw JSON            │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  REST API (Express)          │  │
│  │  - Health checks             │  │
│  │  - Query batches/messages    │  │
│  │  - Verification endpoints    │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌────────────────┐
│  PostgreSQL     │    │  Redis         │
│  - Batches      │    │  - Queue       │
│  - Messages     │    │  - Cache       │
│  - Devices      │    └────────────────┘
└─────────────────┘
```

### 1.2 Component Interaction Flow

```
1. Device publishes → 2. Mosquitto receives → 3. Bridge subscribes
                                                        ↓
                                              4. Parse & Validate
                                                        ↓
                                              5. Push to Queue
                                                        ↓
                                              6. Batch Processor reads
                                                        ↓
                                    7. Check trigger (size=1000 OR time=5min)
                                                        ↓
                                              8. Generate hash
                                                        ↓
                                              9. Store to PostgreSQL
                                                        ↓
                                              10. Mark batch complete
```

---

## 2. Component Design

### 2.1 MQTT Client Component

**Responsibilities:**

- Connect to Mosquitto broker
- Subscribe to topics with wildcards
- Handle connection lifecycle
- Parse incoming messages
- Validate message format
- Push valid messages to queue

**Technology:**

- Library: `mqtt` (MQTT.js)
- Protocol: MQTT 3.1.1
- QoS Level: 1 (at least once delivery)

**Key Configuration:**

```javascript
{
  host: 'localhost',
  port: 1883,
  username: 'bridge_service',
  password: process.env.MQTT_PASSWORD,
  clientId: 'bridge-service-' + Math.random(),
  clean: false,  // Persistent session
  keepalive: 60,
  reconnectPeriod: 5000,
  connectTimeout: 30000
}
```

**Error Handling:**

- Auto-reconnect on connection loss
- Log connection state changes
- Alert on repeated connection failures (> 10 retries)

---

### 2.2 Message Queue Component

**Responsibilities:**

- Buffer incoming messages
- Provide FIFO ordering
- Persist messages for reliability
- Handle backpressure

**Technology Options:**

**Option A: Redis Streams (Recommended for PoC)**

```javascript
// Pros:
- Simple to setup
- Built-in persistence
- Consumer groups for scaling
- Lightweight

// Cons:
- Limited to single Redis instance
- No complex routing
```

**Option B: In-Memory Queue (Simplest)**

```javascript
// Pros:
- No external dependency
- Fastest performance

// Cons:
- Data loss on crash
- Not suitable for production
```

**Decision: Redis Streams** for PoC (balance simplicity + reliability)

**Queue Structure:**

```
Stream: mqtt:messages
Entry ID: auto-generated timestamp
Fields:
  - messageId: UUID
  - topic: full MQTT topic
  - payload: JSON string
  - receivedAt: ISO timestamp
  - tenantId: extracted from topic
  - siteId: extracted from topic
  - deviceId: extracted from topic
```

---

### 2.3 Batch Processor Component

**Responsibilities:**

- Read messages from queue
- Accumulate messages into batches
- Trigger batch completion on size/time
- Generate batch metadata

**Batching Logic:**

```javascript
class BatchProcessor {
  constructor() {
    this.currentBatch = new Batch();
    this.BATCH_SIZE = 1000;
    this.BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    this.batchTimer = null;
  }

  async processMessage(message) {
    // Add message to current batch
    this.currentBatch.addMessage(message);

    // Start timer if first message
    if (this.currentBatch.messageCount === 1) {
      this.startBatchTimer();
    }

    // Check size trigger
    if (this.currentBatch.messageCount >= this.BATCH_SIZE) {
      await this.completeBatch();
    }
  }

  startBatchTimer() {
    this.batchTimer = setTimeout(() => {
      this.completeBatch();
    }, this.BATCH_TIMEOUT_MS);
  }

  async completeBatch() {
    // Cancel timer
    clearTimeout(this.batchTimer);

    // Generate hash
    const batchHash = await hashGenerator.generateBatchHash(this.currentBatch);

    // Store to database
    await storage.saveBatch(this.currentBatch, batchHash);

    // Create new batch
    this.currentBatch = new Batch();
  }
}
```

**State Management:**

- Batch ID: UUID v4
- Start timestamp: First message timestamp
- End timestamp: Last message timestamp or timeout
- Status: 'accumulating', 'hashing', 'storing', 'complete', 'failed'

---

### 2.4 Hash Generator Component

**Responsibilities:**

- Generate deterministic SHA-256 hashes
- Hash individual messages
- Hash entire batches
- Ensure consistency for verification

**Hash Algorithm:**

```javascript
// Individual message hash
messageHash = SHA256(
  deviceId + '|' +
  timestamp + '|' +
  JSON.stringify(sortedPayload)
)

// Batch hash
messagesHash = SHA256(
  message1Hash + message2Hash + ... + messageNHash
)

batchHash = SHA256(
  batchId + '|' +
  messageCount + '|' +
  startTimestamp + '|' +
  endTimestamp + '|' +
  messagesHash
)
```

**Implementation:**

```javascript
const crypto = require("crypto");

function generateMessageHash(message) {
  // Sort JSON keys for consistency
  const sortedPayload = sortKeys(message.payload);

  const input = [
    message.deviceId,
    message.timestamp.toString(),
    JSON.stringify(sortedPayload),
  ].join("|");

  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateBatchHash(batch) {
  // Concatenate all message hashes
  const messagesHash = crypto
    .createHash("sha256")
    .update(batch.messageHashes.join(""))
    .digest("hex");

  const input = [
    batch.id,
    batch.messageCount.toString(),
    batch.startTimestamp.toISOString(),
    batch.endTimestamp.toISOString(),
    messagesHash,
  ].join("|");

  return crypto.createHash("sha256").update(input).digest("hex");
}
```

---

### 2.5 Storage Service Component

**Responsibilities:**

- Write batches to PostgreSQL
- Write messages to PostgreSQL
- Handle transaction rollbacks
- Provide query interfaces

**Database Operations:**

```javascript
async function saveBatch(batch, batchHash) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Insert batch record
    await client.query(
      `
      INSERT INTO batches (
        batch_id, batch_hash, message_count,
        start_timestamp, end_timestamp, status
      ) VALUES ($1, $2, $3, $4, $5, 'complete')
    `,
      [
        batch.id,
        batchHash,
        batch.messageCount,
        batch.startTimestamp,
        batch.endTimestamp,
      ]
    );

    // 2. Insert all messages
    for (const message of batch.messages) {
      await client.query(
        `
        INSERT INTO messages (
          message_id, batch_id, device_id, topic,
          message_hash, raw_data, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          message.id,
          batch.id,
          message.deviceId,
          message.topic,
          message.hash,
          JSON.stringify(message.payload),
          message.receivedAt,
        ]
      );
    }

    // 3. Update device tracking
    await client.query(
      `
      INSERT INTO devices (device_id, tenant_id, site_id, last_seen, message_count)
      VALUES ($1, $2, $3, NOW(), 1)
      ON CONFLICT (device_id) 
      DO UPDATE SET 
        last_seen = NOW(),
        message_count = devices.message_count + 1
    `,
      [batch.deviceId, batch.tenantId, batch.siteId]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
```

---

### 2.6 REST API Component

**Responsibilities:**

- Expose HTTP endpoints
- Handle authentication (future)
- Return JSON responses
- Provide health checks

**Technology:**

- Framework: Express.js
- Port: 3000 (configurable)

**Endpoints:**

```
GET  /health                          - Health check
GET  /metrics                         - Prometheus metrics
GET  /api/v1/batches                  - List batches (paginated)
GET  /api/v1/batches/:batchId         - Get batch details
GET  /api/v1/batches/:batchId/verify  - Verify batch hash
GET  /api/v1/messages/:messageId      - Get message details
GET  /api/v1/messages/search          - Search messages
POST /api/v1/messages/:messageId/verify - Verify message in batch
```

---

## 3. Data Flow Examples

### 3.1 Normal Message Processing

```
Time    Component           Action
------  ------------------  ---------------------------------------
T+0ms   Device              Publishes: veep/factory1/line2/sensor3/data
T+5ms   Mosquitto           Receives and broadcasts to subscribers
T+10ms  Bridge MQTT Client  Receives message
T+12ms  Bridge Parser       Validates JSON, extracts IDs
T+15ms  Bridge Queue        Pushes to Redis stream 'mqtt:messages'
T+20ms  Batch Processor     Reads from queue, adds to current batch
T+25ms  Batch Processor     Batch count now 743/1000, continues accumulating
...
T+3min  Batch Processor     Batch reaches 1000 messages
T+3min  Hash Generator      Generates batch hash (20ms)
T+3min  Storage Service     Writes to PostgreSQL (100ms)
T+3min  Batch Processor     Marks batch complete, creates new batch
```

### 3.2 Timeout-Triggered Batch

```
Time        Component           Action
----------  ------------------  ---------------------------------------
T+0min      Batch Processor     Receives first message, starts 5min timer
T+1min      Batch Processor     500 messages accumulated
T+2min      Batch Processor     700 messages accumulated
T+5min      Batch Timer         Fires timeout event
T+5min      Batch Processor     Completes batch with 700 messages
T+5min      Hash Generator      Generates hash
T+5min      Storage Service     Stores to database
```

---

## 4. Technology Stack Details

### 4.1 Runtime & Framework

| Component       | Technology         | Version  | Purpose              |
| --------------- | ------------------ | -------- | -------------------- |
| Runtime         | Node.js            | 20.x LTS | JavaScript execution |
| API Framework   | Express            | 4.18+    | REST API server      |
| MQTT Client     | mqtt.js            | 5.x      | MQTT protocol        |
| Database Driver | pg (node-postgres) | 8.x      | PostgreSQL client    |
| Queue Client    | ioredis            | 5.x      | Redis operations     |
| Hashing         | crypto (built-in)  | -        | SHA-256 generation   |
| Logging         | winston            | 3.x      | Structured logging   |
| Monitoring      | prom-client        | 15.x     | Prometheus metrics   |

### 4.2 Infrastructure (Docker)

```yaml
Services:
  - mosquitto:2.0-alpine # MQTT Broker (existing)
  - postgres:15-alpine # Database
  - redis:7-alpine # Queue & Cache
```

---

## 5. Configuration Management

### 5.1 Environment Variables

```bash
# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=bridge_service
MQTT_PASSWORD=your_secure_password
MQTT_TOPICS=veep/+/+/+/data

# Batching Configuration
BATCH_SIZE=1000
BATCH_TIMEOUT_MS=300000  # 5 minutes

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=veep_bridge
DATABASE_USER=bridge
DATABASE_PASSWORD=your_db_password
DATABASE_POOL_SIZE=10

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_STREAM_NAME=mqtt:messages
REDIS_CONSUMER_GROUP=batch-processor

# API Server
API_PORT=3000
API_HOST=0.0.0.0

# Logging
LOG_LEVEL=info  # debug, info, warn, error
LOG_FORMAT=json  # json, simple

# Monitoring
METRICS_PORT=9090
```

---

## 6. Error Handling Strategy

### 6.1 Error Categories

| Error Type               | Handling Strategy     | Retry?           | Alert?             |
| ------------------------ | --------------------- | ---------------- | ------------------ |
| MQTT Connection Lost     | Auto-reconnect        | Yes (infinite)   | After 10 failures  |
| Invalid Message Format   | Log & discard         | No               | After 100/hour     |
| Database Connection Lost | Retry with backoff    | Yes (3 attempts) | Immediately        |
| Database Write Failed    | Retry transaction     | Yes (3 attempts) | After 3 failures   |
| Redis Connection Lost    | Fallback to in-memory | No               | Immediately        |
| Queue Full               | Backpressure          | No               | When > 10K pending |

### 6.2 Retry Logic

```javascript
async function withRetry(fn, maxAttempts = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      logger.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms`, {
        error: error.message,
      });
      await sleep(delayMs * attempt); // Exponential backoff
    }
  }
}
```

---

## 7. Monitoring & Observability

### 7.1 Key Metrics

```
# Counter metrics
mqtt_messages_received_total
mqtt_messages_processed_total
mqtt_messages_failed_total
batches_created_total
batches_completed_total
database_writes_total
database_errors_total

# Gauge metrics
mqtt_connection_status (0=disconnected, 1=connected)
queue_pending_messages
current_batch_message_count
database_connection_pool_active
database_connection_pool_idle

# Histogram metrics
message_processing_duration_seconds
batch_processing_duration_seconds
database_write_duration_seconds
```

### 7.2 Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-10-01T10:30:00Z",
  "uptime": 86400,
  "components": {
    "mqtt": {
      "status": "connected",
      "broker": "localhost:1883",
      "lastMessageAt": "2025-10-01T10:29:55Z"
    },
    "database": {
      "status": "connected",
      "activeConnections": 3,
      "lastQueryAt": "2025-10-01T10:29:58Z"
    },
    "redis": {
      "status": "connected",
      "pendingMessages": 15
    },
    "batchProcessor": {
      "status": "running",
      "currentBatchSize": 423,
      "lastBatchCompletedAt": "2025-10-01T10:25:00Z"
    }
  }
}
```

---

## 8. Security Considerations (PoC Scope)

### 8.1 Authentication

- MQTT: Username/password (plain text OK for PoC)
- PostgreSQL: Username/password
- API: No authentication (localhost only)

### 8.2 Network

- All components on localhost
- No TLS/SSL required for PoC
- Firewall: Not applicable (local)

### 8.3 Data Protection

- No encryption at rest (PoC)
- No encryption in transit (PoC)
- Passwords in environment variables (not committed to Git)

---

## 9. Scalability Considerations (Future)

### 9.1 Horizontal Scaling (Not for PoC)

- Multiple Bridge Service instances
- Redis consumer groups for load balancing
- Database connection pooling
- Load balancer for API

### 9.2 Vertical Scaling (Simple)

- Increase BATCH_SIZE for higher throughput
- Increase DATABASE_POOL_SIZE
- Increase Node.js memory limit

---

## 10. Development Guidelines

### 10.1 Code Structure

```
src/
├── index.js              # Entry point
├── config/
│   └── index.js          # Load env vars
├── clients/
│   ├── mqtt.js           # MQTT client wrapper
│   ├── redis.js          # Redis client wrapper
│   └── database.js       # PostgreSQL pool
├── services/
│   ├── messageParser.js  # Parse & validate
│   ├── batchProcessor.js # Batching logic
│   ├── hashGenerator.js  # Hash generation
│   └── storage.js        # Database operations
├── api/
│   ├── server.js         # Express app
│   ├── routes/
│   │   ├── health.js
│   │   ├── batches.js
│   │   └── messages.js
│   └── middleware/
│       ├── errorHandler.js
│       └── logger.js
└── utils/
    ├── logger.js         # Winston logger
    └── metrics.js        # Prometheus client
```

### 10.2 Testing Strategy

- Unit tests: 70%+ coverage
- Integration tests: Critical paths
- Manual testing: Happy path scenarios

---

## 11. Deployment Architecture (Local PoC)

```
Laptop/Desktop
├── Docker Network: bridge-network
│   ├── Container: mosquitto
│   │   └── Port: 1883 → 1883
│   ├── Container: postgres
│   │   └── Port: 5432 → 5432
│   └── Container: redis
│       └── Port: 6379 → 6379
└── Host Process: Node.js Bridge Service
    ├── API Port: 3000
    └── Metrics Port: 9090
```

---

## Document Approval

| Role      | Name        | Date    | Status |
| --------- | ----------- | ------- | ------ |
| Architect | [Your Name] | 2025-10 | Draft  |
| Reviewer  | TBD         | -       | -      |

---

**Next Document:** Database Schema Design
