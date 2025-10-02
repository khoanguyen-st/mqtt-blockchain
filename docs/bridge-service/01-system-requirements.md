# System Requirements Document - MQTT Bridge Service PoC

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Scope:** Local Proof of Concept

---

## 1. Overview

### 1.1 Purpose

Develop a Bridge Service that connects existing Mosquitto MQTT Broker to prepare for Solana blockchain integration. This PoC will focus on message collection, batching, and hashing without actual blockchain writes.

### 1.2 Goals

- ✅ Receive and process MQTT messages from IoT devices
- ✅ Batch messages efficiently
- ✅ Generate cryptographic hashes for batches
- ✅ Store raw data and metadata
- ✅ Provide verification API
- ⏸️ Actual Solana integration (Phase 2)

---

## 2. Functional Requirements

### 2.1 MQTT Message Ingestion

**FR-001: MQTT Connection**

- Bridge Service MUST connect to Mosquitto broker
- MUST support username/password authentication
- MUST auto-reconnect on connection loss
- SHOULD log connection status changes

**FR-002: Topic Subscription**

- MUST subscribe to topic pattern: `veep/+/+/+/data`
- MUST parse topic structure to extract:
  - `tenant_id` (customer/factory identifier)
  - `site_id` (location/production line)
  - `device_id` (sensor identifier)

**FR-003: Message Validation**

- MUST validate JSON format
- MUST validate required fields:
  ```json
  {
    "deviceId": "string (required)",
    "timestamp": "number (unix timestamp, required)",
    "kwh": "number (optional)",
    "voltage": "number (optional)",
    "data": "object (optional, for flexible schema)"
  }
  ```
- MUST reject invalid messages and log errors
- SHOULD accept additional custom fields

### 2.2 Data Batching

**FR-004: Batch Creation Rules**

- MUST create new batch when:
  - Message count reaches **1000 messages**, OR
  - **5 minutes** elapsed since batch started
  - Whichever comes first
- MUST assign unique batch ID (UUID)
- MUST record batch start/end timestamps

**FR-005: Hash Generation**

- MUST generate SHA-256 hash for each batch
- Hash input format:
  ```
  {batch_id}|{message_count}|{start_timestamp}|{end_timestamp}|{messages_hash}
  ```
- `messages_hash` = SHA-256 of concatenated individual message hashes
- MUST be deterministic (same input = same hash)

### 2.3 Data Storage

**FR-006: Database Storage**

- MUST store batch metadata in PostgreSQL:
  - Batch ID, hash, message count, timestamps, status
- MUST store message metadata:
  - Message ID, batch ID, device ID, topic, timestamp
  - S3 key reference (for future S3 integration)
  - Individual message hash

**FR-007: Raw Data Storage**

- For PoC: MUST store raw JSON in PostgreSQL `messages` table
- For Production: SHOULD migrate to S3
- MUST maintain data integrity (no data loss)

### 2.4 Query & Verification

**FR-008: Batch Verification API**

- MUST provide REST endpoint to verify batch by ID
- MUST return batch hash and message list
- MUST allow verification of individual message in batch

**FR-009: Message Lookup**

- MUST provide endpoint to search messages by:
  - Device ID
  - Time range
  - Batch ID

---

## 3. Non-Functional Requirements

### 3.1 Performance

**NFR-001: Throughput**

- MUST handle **100 messages/second** sustained load
- SHOULD handle **500 messages/second** peak load
- Target latency: < 1 second from MQTT receive to DB write

**NFR-002: Resource Usage**

- MUST run on laptop/desktop with:
  - 4GB RAM available
  - 2 CPU cores
  - 10GB disk space

### 3.2 Reliability

**NFR-003: Data Integrity**

- Zero message loss under normal operation
- MUST persist messages before acknowledging to queue
- MUST handle crashes gracefully (recover on restart)

**NFR-004: Error Handling**

- MUST retry failed database writes (up to 3 attempts)
- MUST log all errors with context
- MUST not crash on invalid messages

### 3.3 Observability

**NFR-005: Logging**

- MUST log at INFO level:
  - Service start/stop
  - MQTT connection changes
  - Batch creation/completion
  - Database operations
- MUST log at ERROR level:
  - Connection failures
  - Data validation errors
  - Storage failures

**NFR-006: Metrics**

- MUST expose Prometheus metrics:
  - Messages received count
  - Messages processed count
  - Batches created count
  - Processing latency histogram
  - Error count by type

**NFR-007: Health Checks**

- MUST provide `/health` endpoint returning:
  - MQTT connection status
  - Database connection status
  - Redis connection status (if used)
  - Pending message count

---

## 4. Technical Constraints

### 4.1 Technology Stack

- **Runtime:** Node.js 18+ or 20+
- **MQTT Client:** MQTT.js
- **Database:** PostgreSQL 14+
- **Queue (Optional):** Redis 7+
- **API Framework:** Express.js

### 4.2 Development Environment

- **OS:** macOS, Linux, or Windows with WSL2
- **Docker:** Required for running dependencies
- **IDE:** VS Code recommended

---

## 5. Out of Scope (for PoC)

- ❌ Actual Solana blockchain writes
- ❌ Device-level digital signatures
- ❌ AWS S3 integration (use PostgreSQL for now)
- ❌ High availability / clustering
- ❌ Production security hardening
- ❌ Performance optimization beyond basic requirements
- ❌ Web dashboard UI (API only)

---

## 6. Acceptance Criteria

### PoC is considered successful when:

1. ✅ Bridge Service connects to Mosquitto and receives messages
2. ✅ Messages are validated and stored in PostgreSQL
3. ✅ Batches are created based on size/time rules
4. ✅ Batch hashes are generated correctly
5. ✅ API endpoints return correct data
6. ✅ Can verify a message belongs to a specific batch
7. ✅ System runs for 1 hour processing 1000+ messages without crashes
8. ✅ Documentation allows another developer to run the system

---

## 7. Testing Requirements

### 7.1 Unit Tests

- Message parser
- Hash generator
- Batch logic (size/time triggers)

### 7.2 Integration Tests

- MQTT → Database flow
- Batch creation under load
- API endpoints

### 7.3 Manual Testing

- Publish test messages via `mosquitto_pub`
- Verify data in PostgreSQL
- Call API endpoints and validate responses

---

## 8. Success Metrics

**PoC Completion Timeline:** 4 weeks

**Key Metrics:**

- Message processing success rate: > 99.9%
- Average batch completion time: < 5 minutes
- API response time: < 100ms for queries
- Zero data loss during normal operation

---

## 9. Future Enhancements (Post-PoC)

1. Solana blockchain integration
2. S3 storage for raw messages
3. Device signature verification
4. Merkle tree for efficient proofs
5. Web dashboard
6. Alert system
7. Automated deployment
8. Load testing at 10K messages/sec

---

## 10. Assumptions & Dependencies

### Assumptions

- Mosquitto broker is already running and accessible
- Devices are already sending messages in expected JSON format
- Topic structure follows `veep/{tenant_id}/{site_id}/{device_id}/data`
- Message rate stays under 100/sec during PoC

### Dependencies

- Mosquitto MQTT Broker (external)
- PostgreSQL (Docker)
- Redis (Docker, optional)
- Node.js runtime

---

## Document Approval

| Role      | Name        | Date    | Status |
| --------- | ----------- | ------- | ------ |
| Developer | [Your Name] | 2025-10 | Draft  |
| Reviewer  | TBD         | -       | -      |

---

**Next Steps:**

1. Review and approve this document
2. Proceed to Technical Architecture Document
3. Begin database schema design
