# Development Plan Document - MQTT Bridge Service PoC

**Scope:** Local Proof of Concept

---

## 1. Overview

### 1.1 Project Timeline

- **Start Date:** TBD
- **Target Completion:** TBD
- **Development Approach:** Iterative, milestone-based

### 1.2 Development Phases

```
1: Foundation & Setup
2: Core Functionality
3: Integration & Polish
4: Testing & Documentation
```

---

## 2. Foundation & Setup

### 2.1 Milestone 1.1: Project Setup (Days 1-2)

**Objectives:**

- Initialize project structure
- Setup development environment
- Configure version control

**Tasks:**

| Task                                      | Est. Hours | Priority |
| ----------------------------------------- | ---------- | -------- |
| Create project directory structure        | 1h         | High     |
| Initialize Node.js project (package.json) | 0.5h       | High     |
| Setup Git repository & .gitignore         | 0.5h       | High     |
| Install core dependencies                 | 1h         | High     |
| Create .env.example file                  | 0.5h       | High     |
| Setup ESLint & Prettier                   | 1h         | Medium   |
| Write initial README.md                   | 1h         | High     |

**Dependencies:**

```json
{
  "dependencies": {
    "mqtt": "^5.2.0",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "ioredis": "^5.3.2",
    "winston": "^3.11.0",
    "prom-client": "^15.1.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "eslint": "^8.54.0",
    "prettier": "^3.1.0",
    "nodemon": "^3.0.2"
  }
}
```

**Deliverables:**

- ✅ Working project structure
- ✅ All dependencies installed
- ✅ Git repository initialized
- ✅ Development scripts in package.json

---

### 2.2 Milestone 1.2: Database Setup (Days 2-3)

**Objectives:**

- Setup PostgreSQL with Docker
- Create database schema
- Implement database connection pool

**Tasks:**

| Task                                    | Est. Hours | Priority |
| --------------------------------------- | ---------- | -------- |
| Write docker-compose.yml for PostgreSQL | 1h         | High     |
| Create database migration scripts       | 2h         | High     |
| Test database connection from Node.js   | 1h         | High     |
| Implement connection pool wrapper       | 2h         | High     |
| Write database utility functions        | 2h         | Medium   |
| Create seed data for testing            | 1h         | Low      |

**Files to Create:**

```
docker/
├── docker-compose.yml
scripts/
├── 001_initial_schema.sql
├── 002_seed_data.sql
src/
├── clients/
│   └── database.js
├── utils/
    └── dbHelpers.js
```

**Deliverables:**

- ✅ PostgreSQL running in Docker
- ✅ Database schema created
- ✅ Connection pool configured
- ✅ Basic CRUD operations tested

---

### 2.3 Milestone 1.3: MQTT Client Implementation (Days 3-5)

**Objectives:**

- Connect to Mosquitto broker
- Subscribe to topics
- Handle message parsing

**Tasks:**

| Task                              | Est. Hours | Priority |
| --------------------------------- | ---------- | -------- |
| Implement MQTT client wrapper     | 3h         | High     |
| Add connection lifecycle handling | 2h         | High     |
| Implement topic subscription      | 1h         | High     |
| Write message parser & validator  | 3h         | High     |
| Add error handling & logging      | 2h         | High     |
| Unit tests for parser             | 2h         | Medium   |

**Files to Create:**

```
src/
├── clients/
│   └── mqtt.js
├── services/
│   └── messageParser.js
tests/
└── unit/
    └── messageParser.test.js
```

**Code Snippet - MQTT Client:**

```javascript
// src/clients/mqtt.js
const mqtt = require("mqtt");
const logger = require("../utils/logger");

class MQTTClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.config.url, {
        username: this.config.username,
        password: this.config.password,
        clientId: `bridge-${Date.now()}`,
        clean: false,
        keepalive: 60,
        reconnectPeriod: 5000,
      });

      this.client.on("connect", () => {
        logger.info("Connected to MQTT broker");
        this.isConnected = true;
        resolve();
      });

      this.client.on("error", (error) => {
        logger.error("MQTT connection error", { error });
        reject(error);
      });

      this.client.on("message", this.handleMessage.bind(this));
    });
  }

  subscribe(topics) {
    if (!this.isConnected) {
      throw new Error("Not connected to MQTT broker");
    }
    this.client.subscribe(topics, { qos: 1 });
    logger.info("Subscribed to topics", { topics });
  }

  handleMessage(topic, message) {
    // Will be implemented with message processor
  }
}

module.exports = MQTTClient;
```

**Deliverables:**

- ✅ MQTT client connects to broker
- ✅ Messages can be received
- ✅ Message parsing works correctly
- ✅ Unit tests pass

---

## 3. Week 2: Core Functionality

### 3.1 Milestone 2.1: Redis Queue Implementation (Days 6-7)

**Objectives:**

- Setup Redis with Docker
- Implement message queue using Redis Streams
- Handle queue operations

**Tasks:**

| Task                              | Est. Hours | Priority |
| --------------------------------- | ---------- | -------- |
| Add Redis to docker-compose.yml   | 0.5h       | High     |
| Implement Redis client wrapper    | 2h         | High     |
| Create queue push/pop operations  | 3h         | High     |
| Add queue monitoring functions    | 2h         | Medium   |
| Error handling for Redis failures | 2h         | High     |
| Integration tests for queue       | 2h         | Medium   |

**Files to Create:**

```
src/
├── clients/
│   └── redis.js
├── services/
│   └── messageQueue.js
tests/
└── integration/
    └── queue.test.js
```

**Deliverables:**

- ✅ Redis running in Docker
- ✅ Messages can be queued
- ✅ Messages can be consumed
- ✅ Queue persistence works

---

### 3.2 Milestone 2.2: Batch Processor (Days 8-10)

**Objectives:**

- Implement batching logic
- Handle size and time triggers
- Generate batch metadata

**Tasks:**

| Task                               | Est. Hours | Priority |
| ---------------------------------- | ---------- | -------- |
| Design batch processor class       | 2h         | High     |
| Implement message accumulation     | 3h         | High     |
| Add batch size trigger             | 2h         | High     |
| Add batch timeout trigger          | 2h         | High     |
| Implement batch completion handler | 3h         | High     |
| Add state persistence              | 2h         | Medium   |
| Unit tests for batch logic         | 3h         | High     |

**Files to Create:**

```
src/
├── services/
│   ├── batchProcessor.js
│   └── batchState.js
tests/
└── unit/
    └── batchProcessor.test.js
```

**Code Snippet - Batch Processor:**

```javascript
// src/services/batchProcessor.js
const { v4: uuidv4 } = require("uuid");

class BatchProcessor {
  constructor(config, hashGenerator, storage) {
    this.BATCH_SIZE = config.batchSize || 1000;
    this.BATCH_TIMEOUT_MS = config.batchTimeoutMs || 300000;

    this.hashGenerator = hashGenerator;
    this.storage = storage;

    this.currentBatch = this.createNewBatch();
    this.batchTimer = null;
  }

  createNewBatch() {
    return {
      id: uuidv4(),
      messages: [],
      messageHashes: [],
      startTimestamp: null,
      endTimestamp: null,
      messageCount: 0,
    };
  }

  async addMessage(message) {
    // First message starts the timer
    if (this.currentBatch.messageCount === 0) {
      this.currentBatch.startTimestamp = new Date();
      this.startBatchTimer();
    }

    // Add message to batch
    this.currentBatch.messages.push(message);
    this.currentBatch.messageCount++;

    // Generate and store message hash
    const messageHash = this.hashGenerator.generateMessageHash(message);
    this.currentBatch.messageHashes.push(messageHash);

    // Check if batch is full
    if (this.currentBatch.messageCount >= this.BATCH_SIZE) {
      await this.completeBatch("size_trigger");
    }
  }

  startBatchTimer() {
    this.batchTimer = setTimeout(async () => {
      await this.completeBatch("timeout_trigger");
    }, this.BATCH_TIMEOUT_MS);
  }

  async completeBatch(reason) {
    // Cancel timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Set end timestamp
    this.currentBatch.endTimestamp = new Date();

    // Generate batch hash
    const batchHash = this.hashGenerator.generateBatchHash(this.currentBatch);

    // Store to database
    await this.storage.saveBatch(this.currentBatch, batchHash);

    logger.info("Batch completed", {
      batchId: this.currentBatch.id,
      messageCount: this.currentBatch.messageCount,
      reason,
    });

    // Create new batch
    this.currentBatch = this.createNewBatch();
  }
}

module.exports = BatchProcessor;
```

**Deliverables:**

- ✅ Batches created on size trigger
- ✅ Batches created on timeout
- ✅ Batch metadata correct
- ✅ Tests pass for all scenarios

---

### 3.3 Milestone 2.3: Hash Generator (Days 10-11)

**Objectives:**

- Implement SHA-256 hashing
- Create deterministic message hashes
- Create batch hash from message hashes

**Tasks:**

| Task                                 | Est. Hours | Priority |
| ------------------------------------ | ---------- | -------- |
| Implement message hash function      | 2h         | High     |
| Implement batch hash function        | 2h         | High     |
| Add JSON key sorting for consistency | 1h         | High     |
| Write hash verification functions    | 2h         | Medium   |
| Unit tests for all hash functions    | 2h         | High     |
| Performance testing                  | 1h         | Low      |

**Files to Create:**

```
src/
├── services/
│   └── hashGenerator.js
└── utils/
    └── jsonHelpers.js
tests/
└── unit/
    └── hashGenerator.test.js
```

**Deliverables:**

- ✅ Hashes generated correctly
- ✅ Hashes are deterministic
- ✅ Hash verification works
- ✅ Performance acceptable (< 1ms per message)

---

## 4. Week 3: Integration & Polish

### 4.1 Milestone 3.1: Storage Service (Days 12-14)

**Objectives:**

- Implement database write operations
- Handle transactions correctly
- Add retry logic

**Tasks:**

| Task                           | Est. Hours | Priority |
| ------------------------------ | ---------- | -------- |
| Implement saveBatch function   | 4h         | High     |
| Implement saveMessage function | 2h         | High     |
| Add transaction handling       | 2h         | High     |
| Implement retry logic          | 3h         | High     |
| Add device tracking updates    | 2h         | Medium   |
| Integration tests for storage  | 3h         | High     |

**Files to Create:**

```
src/
├── services/
│   └── storage.js
tests/
└── integration/
    └── storage.test.js
```

**Deliverables:**

- ✅ Batches saved to database
- ✅ Messages saved to database
- ✅ Transactions work correctly
- ✅ Retry logic handles failures

---

### 4.2 Milestone 3.2: REST API Implementation (Days 14-16)

**Objectives:**

- Implement Express server
- Create all API endpoints
- Add error handling middleware

**Tasks:**

| Task                          | Est. Hours | Priority |
| ----------------------------- | ---------- | -------- |
| Setup Express server          | 2h         | High     |
| Implement /health endpoint    | 1h         | High     |
| Implement /metrics endpoint   | 2h         | High     |
| Implement batch endpoints     | 4h         | High     |
| Implement message endpoints   | 4h         | High     |
| Implement device endpoints    | 2h         | Medium   |
| Add error handling middleware | 2h         | High     |
| Add request logging           | 1h         | Medium   |
| API integration tests         | 4h         | High     |

**Files to Create:**

```
src/
├── api/
│   ├── server.js
│   ├── routes/
│   │   ├── health.js
│   │   ├── metrics.js
│   │   ├── batches.js
│   │   ├── messages.js
│   │   └── devices.js
│   └── middleware/
│       ├── errorHandler.js
│       └── requestLogger.js
tests/
└── integration/
    └── api.test.js
```

**Deliverables:**

- ✅ All API endpoints working
- ✅ Error handling consistent
- ✅ API tests pass
- ✅ Postman/Insomnia collection created

---

### 4.3 Milestone 3.3: End-to-End Integration (Days 16-17)

**Objectives:**

- Connect all components
- Test complete data flow
- Fix integration issues

**Tasks:**

| Task                                   | Est. Hours | Priority |
| -------------------------------------- | ---------- | -------- |
| Wire up MQTT → Queue → Batch → DB flow | 3h         | High     |
| Add monitoring metrics collection      | 2h         | High     |
| Implement graceful shutdown            | 2h         | High     |
| Add process-level error handling       | 2h         | High     |
| End-to-end integration tests           | 4h         | High     |
| Fix bugs discovered during testing     | 4h         | High     |

**Files to Create:**

```
src/
├── index.js (main entry point)
└── utils/
    ├── shutdown.js
    └── processHandlers.js
tests/
└── e2e/
    └── fullFlow.test.js
```

**Deliverables:**

- ✅ Complete system working
- ✅ All components integrated
- ✅ No memory leaks
- ✅ Clean shutdown works

---

## 5. Week 4: Testing & Documentation

### 5.1 Milestone 4.1: Testing & Quality Assurance (Days 18-20)

**Objectives:**

- Achieve test coverage > 70%
- Perform load testing
- Fix bugs

**Tasks:**

| Task                              | Est. Hours | Priority |
| --------------------------------- | ---------- | -------- |
| Write missing unit tests          | 6h         | High     |
| Write integration tests           | 4h         | High     |
| Perform load testing (1000 msg/s) | 3h         | High     |
| Memory leak testing (24h run)     | 2h         | Medium   |
| Fix bugs found during testing     | 8h         | High     |
| Code review & refactoring         | 4h         | Medium   |

**Testing Checklist:**

- [ ] Unit test coverage > 70%
- [ ] All integration tests pass
- [ ] API tests pass
- [ ] Load test: 100 msg/s for 1 hour
- [ ] Load test: 500 msg/s for 10 minutes
- [ ] 24-hour stability test
- [ ] Memory usage < 500MB under load
- [ ] CPU usage < 50% under normal load

**Deliverables:**

- ✅ All tests pass
- ✅ Test coverage > 70%
- ✅ Performance benchmarks met
- ✅ No critical bugs

---

### 5.2 Milestone 4.2: Documentation (Days 20-22)

**Objectives:**

- Complete all documentation
- Write setup instructions
- Create user guides

**Tasks:**

| Task                                  | Est. Hours | Priority |
| ------------------------------------- | ---------- | -------- |
| Update README.md                      | 2h         | High     |
| Write SETUP.md (detailed setup guide) | 3h         | High     |
| Write API_EXAMPLES.md                 | 2h         | High     |
| Write ARCHITECTURE.md (from tech doc) | 2h         | High     |
| Add inline code comments              | 3h         | Medium   |
| Create troubleshooting guide          | 2h         | Medium   |
| Record demo video (optional)          | 2h         | Low      |

**Documentation Deliverables:**

```
docs/
├── SETUP.md
├── ARCHITECTURE.md
├── API_EXAMPLES.md
├── TROUBLESHOOTING.md
└── FUTURE_ENHANCEMENTS.md
README.md (updated)
CHANGELOG.md
```

**Deliverables:**

- ✅ All documentation complete
- ✅ Setup guide tested by peer
- ✅ API examples work
- ✅ Troubleshooting guide covers common issues

---

### 5.3 Milestone 4.3: Final Review & Handoff (Days 23-24)

**Objectives:**

- Code review
- Demo preparation
- Knowledge transfer

**Tasks:**

| Task                       | Est. Hours | Priority |
| -------------------------- | ---------- | -------- |
| Final code review          | 3h         | High     |
| Prepare demo environment   | 2h         | High     |
| Create demo script         | 1h         | Medium   |
| Run full test suite        | 1h         | High     |
| Demo presentation          | 1h         | High     |
| Knowledge transfer session | 2h         | High     |
| Project retrospective      | 2h         | Medium   |

**Demo Checklist:**

- [ ] Clean dev environment
- [ ] Sample devices publishing data
- [ ] Show real-time batching
- [ ] Query API endpoints
- [ ] Verify batch integrity
- [ ] Show monitoring metrics

**Deliverables:**

- ✅ Demo successfully presented
- ✅ All code reviewed
- ✅ Knowledge transferred
- ✅ PoC accepted

---

## 6. Risk Management

### 6.1 Technical Risks

| Risk                          | Probability | Impact | Mitigation                                                     |
| ----------------------------- | ----------- | ------ | -------------------------------------------------------------- |
| MQTT connection unstable      | Medium      | High   | Implement robust reconnection logic, add connection monitoring |
| PostgreSQL performance issues | Low         | Medium | Use connection pooling, optimize queries, add indexes          |
| Redis data loss on crash      | Medium      | Medium | Use Redis persistence (AOF), implement recovery logic          |
| Batch timeout doesn't trigger | Low         | High   | Add extensive unit tests, use reliable timer library           |
| Memory leak under load        | Medium      | High   | Regular memory profiling, 24-hour test, limit batch size       |

### 6.2 Schedule Risks

| Risk                      | Probability | Impact | Mitigation                                             |
| ------------------------- | ----------- | ------ | ------------------------------------------------------ |
| Underestimated complexity | Medium      | Medium | Add 20% buffer to estimates, cut low-priority features |
| Blocked by dependencies   | Low         | High   | Setup all infrastructure early, have fallback plans    |
| Testing takes longer      | High        | Medium | Start testing early, automate where possible           |

---

## 7. Quality Metrics

### 7.1 Code Quality

- ESLint: 0 errors, < 10 warnings
- Test coverage: > 70%
- Code duplication: < 5%
- Function complexity: < 15 (cyclomatic)

### 7.2 Performance Metrics

- Message throughput: 100 msg/s sustained
- API response time: < 100ms (p95)
- Database query time: < 50ms (p95)
- Memory usage: < 500MB under load
- CPU usage: < 50% under load

### 7.3 Reliability Metrics

- Message loss rate: 0%
- Batch hash accuracy: 100%
- API uptime: > 99%
- Database connection uptime: > 99.9%

---

## 8. Definition of Done

A milestone is considered **Done** when:

1. ✅ All tasks completed
2. ✅ Code reviewed
3. ✅ Tests written and passing
4. ✅ Documentation updated
5. ✅ No critical bugs
6. ✅ Deployed to dev environment
7. ✅ Demo-able to stakeholders

---

## 9. Daily Standup Template

**What did I do yesterday?**

- [List completed tasks]

**What will I do today?**

- [List planned tasks]

**Any blockers?**

- [List any issues]

**Notes:**

- [Any other relevant information]

---

## 10. Weekly Review Checklist

**End of each week:**

- [ ] Review milestone completion
- [ ] Update timeline if needed
- [ ] Document lessons learned
- [ ] Plan next week's tasks
- [ ] Update risk register
- [ ] Commit and push all code
- [ ] Backup database

---

## Document Approval

| Role      | Name        | Date    | Status |
| --------- | ----------- | ------- | ------ |
| Developer | [Your Name] | 2025-10 | Draft  |
| Reviewer  | TBD         | -       | -      |

---

**Next Document:** Setup Guide
