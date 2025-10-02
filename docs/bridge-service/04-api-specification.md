# API Specification Document - MQTT Bridge Service PoC

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Scope:** Local Proof of Concept

---

## 1. Overview

### 1.1 Purpose

Define REST API endpoints for the MQTT Bridge Service to enable monitoring, querying, and verification of batches and messages.

### 1.2 Base Information

- **Base URL:** `http://localhost:3000`
- **API Version:** v1
- **Content Type:** `application/json`
- **Authentication:** None (PoC - localhost only)

---

## 2. API Endpoints

### 2.1 Health & Monitoring

#### GET `/health`

**Description:** Health check endpoint for monitoring service status

**Request:**

```http
GET /health HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2025-10-01T10:30:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "components": {
    "mqtt": {
      "status": "connected",
      "broker": "mqtt://localhost:1883",
      "lastMessageAt": "2025-10-01T10:29:55.000Z",
      "messagesReceived": 1547892
    },
    "database": {
      "status": "connected",
      "host": "localhost:5432",
      "activeConnections": 3,
      "idleConnections": 7,
      "lastQueryAt": "2025-10-01T10:29:58.000Z"
    },
    "redis": {
      "status": "connected",
      "host": "localhost:6379",
      "pendingMessages": 15
    },
    "batchProcessor": {
      "status": "running",
      "currentBatchId": "550e8400-e29b-41d4-a716-446655440000",
      "currentBatchSize": 423,
      "lastBatchCompletedAt": "2025-10-01T10:25:00.000Z"
    }
  }
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-01T10:30:00.000Z",
  "components": {
    "mqtt": {
      "status": "disconnected",
      "error": "Connection refused"
    },
    "database": {
      "status": "error",
      "error": "Connection timeout"
    }
  }
}
```

---

#### GET `/metrics`

**Description:** Prometheus metrics endpoint

**Request:**

```http
GET /metrics HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```
# HELP mqtt_messages_received_total Total number of MQTT messages received
# TYPE mqtt_messages_received_total counter
mqtt_messages_received_total 1547892

# HELP mqtt_messages_processed_total Total number of messages successfully processed
# TYPE mqtt_messages_processed_total counter
mqtt_messages_processed_total 1547890

# HELP mqtt_messages_failed_total Total number of failed messages
# TYPE mqtt_messages_failed_total counter
mqtt_messages_failed_total 2

# HELP batches_created_total Total number of batches created
# TYPE batches_created_total counter
batches_created_total 1548

# HELP batches_completed_total Total number of batches completed
# TYPE batches_completed_total counter
batches_completed_total 1547

# HELP message_processing_duration_seconds Message processing duration
# TYPE message_processing_duration_seconds histogram
message_processing_duration_seconds_bucket{le="0.001"} 1200000
message_processing_duration_seconds_bucket{le="0.005"} 1500000
message_processing_duration_seconds_bucket{le="0.01"} 1547000
message_processing_duration_seconds_bucket{le="+Inf"} 1547892
message_processing_duration_seconds_sum 1547.892
message_processing_duration_seconds_count 1547892

# HELP batch_processing_duration_seconds Batch processing duration
# TYPE batch_processing_duration_seconds histogram
batch_processing_duration_seconds_bucket{le="1"} 1200
batch_processing_duration_seconds_bucket{le="5"} 1500
batch_processing_duration_seconds_bucket{le="10"} 1547
batch_processing_duration_seconds_bucket{le="+Inf"} 1548
batch_processing_duration_seconds_sum 7740
batch_processing_duration_seconds_count 1548
```

---

### 2.2 Batch Endpoints

#### GET `/api/v1/batches`

**Description:** List batches with pagination

**Query Parameters:**

| Parameter | Type    | Required | Default    | Description                                                  |
| --------- | ------- | -------- | ---------- | ------------------------------------------------------------ |
| page      | integer | No       | 1          | Page number (1-indexed)                                      |
| limit     | integer | No       | 20         | Items per page (max: 100)                                    |
| status    | string  | No       | all        | Filter by status: `pending`, `complete`, `failed`, `all`     |
| sort      | string  | No       | created_at | Sort field: `created_at`, `message_count`, `start_timestamp` |
| order     | string  | No       | desc       | Sort order: `asc`, `desc`                                    |

**Request:**

```http
GET /api/v1/batches?page=1&limit=10&status=complete&sort=created_at&order=desc HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "batchId": "550e8400-e29b-41d4-a716-446655440000",
      "batchHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
      "messageCount": 1000,
      "startTimestamp": "2025-10-01T10:00:00.000Z",
      "endTimestamp": "2025-10-01T10:05:00.000Z",
      "status": "complete",
      "createdAt": "2025-10-01T10:05:01.000Z",
      "confirmedAt": null,
      "solanaTxSignature": null
    },
    {
      "batchId": "660e8400-e29b-41d4-a716-446655440001",
      "batchHash": "b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5",
      "messageCount": 1000,
      "startTimestamp": "2025-10-01T09:55:00.000Z",
      "endTimestamp": "2025-10-01T10:00:00.000Z",
      "status": "complete",
      "createdAt": "2025-10-01T10:00:01.000Z",
      "confirmedAt": null,
      "solanaTxSignature": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1548,
    "totalPages": 155
  }
}
```

**Response (400 Bad Request):**

```json
{
  "error": "Bad Request",
  "message": "Invalid query parameter: page must be a positive integer",
  "code": "INVALID_PARAMETER"
}
```

---

#### GET `/api/v1/batches/:batchId`

**Description:** Get detailed information about a specific batch

**Path Parameters:**

| Parameter | Type | Description      |
| --------- | ---- | ---------------- |
| batchId   | UUID | Batch identifier |

**Request:**

```http
GET /api/v1/batches/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "batchHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
  "messageCount": 1000,
  "startTimestamp": "2025-10-01T10:00:00.000Z",
  "endTimestamp": "2025-10-01T10:05:00.000Z",
  "status": "complete",
  "createdAt": "2025-10-01T10:05:01.000Z",
  "confirmedAt": null,
  "solanaTxSignature": null,
  "solanBlockNumber": null,
  "statistics": {
    "devices": [
      {
        "deviceId": "SENSOR_001",
        "messageCount": 340
      },
      {
        "deviceId": "SENSOR_002",
        "messageCount": 330
      },
      {
        "deviceId": "SENSOR_003",
        "messageCount": 330
      }
    ],
    "averageProcessingTime": 0.0012,
    "totalSize": 487520
  }
}
```

**Response (404 Not Found):**

```json
{
  "error": "Not Found",
  "message": "Batch with ID 550e8400-e29b-41d4-a716-446655440000 not found",
  "code": "BATCH_NOT_FOUND"
}
```

---

#### GET `/api/v1/batches/:batchId/messages`

**Description:** Get messages in a specific batch

**Path Parameters:**

| Parameter | Type | Description      |
| --------- | ---- | ---------------- |
| batchId   | UUID | Batch identifier |

**Query Parameters:**

| Parameter | Type    | Required | Default | Description                |
| --------- | ------- | -------- | ------- | -------------------------- |
| page      | integer | No       | 1       | Page number                |
| limit     | integer | No       | 100     | Items per page (max: 1000) |

**Request:**

```http
GET /api/v1/batches/550e8400-e29b-41d4-a716-446655440000/messages?page=1&limit=100 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "data": [
    {
      "messageId": "770e8400-e29b-41d4-a716-446655440002",
      "deviceId": "SENSOR_001",
      "topic": "veep/factory1/line2/SENSOR_001/data",
      "messageHash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "receivedAt": "2025-10-01T10:00:00.123Z",
      "processedAt": "2025-10-01T10:05:01.456Z",
      "data": {
        "deviceId": "SENSOR_001",
        "timestamp": 1696156800,
        "kwh": 15.7,
        "voltage": 220.1,
        "current": 71.36
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 1000,
    "totalPages": 10
  }
}
```

---

#### POST `/api/v1/batches/:batchId/verify`

**Description:** Verify the integrity of a batch by recalculating its hash

**Path Parameters:**

| Parameter | Type | Description      |
| --------- | ---- | ---------------- |
| batchId   | UUID | Batch identifier |

**Request:**

```http
POST /api/v1/batches/550e8400-e29b-41d4-a716-446655440000/verify HTTP/1.1
Host: localhost:3000
Content-Type: application/json
```

**Response (200 OK):**

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "storedHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
  "calculatedHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
  "isValid": true,
  "verifiedAt": "2025-10-01T10:30:00.000Z",
  "messageCount": 1000,
  "messageHashesVerified": true
}
```

**Response (200 OK - Invalid):**

```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "storedHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
  "calculatedHash": "DIFFERENT_HASH_VALUE",
  "isValid": false,
  "verifiedAt": "2025-10-01T10:30:00.000Z",
  "error": "Hash mismatch detected"
}
```

---

### 2.3 Message Endpoints

#### GET `/api/v1/messages/:messageId`

**Description:** Get details of a specific message

**Path Parameters:**

| Parameter | Type | Description        |
| --------- | ---- | ------------------ |
| messageId | UUID | Message identifier |

**Request:**

```http
GET /api/v1/messages/770e8400-e29b-41d4-a716-446655440002 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "messageId": "770e8400-e29b-41d4-a716-446655440002",
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceId": "SENSOR_001",
  "topic": "veep/factory1/line2/SENSOR_001/data",
  "messageHash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "receivedAt": "2025-10-01T10:00:00.123Z",
  "processedAt": "2025-10-01T10:05:01.456Z",
  "data": {
    "deviceId": "SENSOR_001",
    "timestamp": 1696156800,
    "kwh": 15.7,
    "voltage": 220.1,
    "current": 71.36,
    "temperature": 32.5
  },
  "batch": {
    "batchId": "550e8400-e29b-41d4-a716-446655440000",
    "batchHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
    "status": "complete"
  }
}
```

**Response (404 Not Found):**

```json
{
  "error": "Not Found",
  "message": "Message with ID 770e8400-e29b-41d4-a716-446655440002 not found",
  "code": "MESSAGE_NOT_FOUND"
}
```

---

#### GET `/api/v1/messages/search`

**Description:** Search messages by device, time range, or other criteria

**Query Parameters:**

| Parameter | Type     | Required | Description                              |
| --------- | -------- | -------- | ---------------------------------------- |
| deviceId  | string   | No       | Filter by device ID                      |
| startTime | ISO 8601 | No       | Start of time range                      |
| endTime   | ISO 8601 | No       | End of time range                        |
| tenantId  | string   | No       | Filter by tenant                         |
| siteId    | string   | No       | Filter by site                           |
| page      | integer  | No       | Page number (default: 1)                 |
| limit     | integer  | No       | Items per page (default: 100, max: 1000) |

**Request:**

```http
GET /api/v1/messages/search?deviceId=SENSOR_001&startTime=2025-10-01T09:00:00Z&endTime=2025-10-01T11:00:00Z&limit=50 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "messageId": "770e8400-e29b-41d4-a716-446655440002",
      "batchId": "550e8400-e29b-41d4-a716-446655440000",
      "deviceId": "SENSOR_001",
      "topic": "veep/factory1/line2/SENSOR_001/data",
      "messageHash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "receivedAt": "2025-10-01T10:00:00.123Z",
      "data": {
        "deviceId": "SENSOR_001",
        "timestamp": 1696156800,
        "kwh": 15.7,
        "voltage": 220.1
      }
    }
  ],
  "filters": {
    "deviceId": "SENSOR_001",
    "startTime": "2025-10-01T09:00:00.000Z",
    "endTime": "2025-10-01T11:00:00.000Z"
  },
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1200,
    "totalPages": 24
  }
}
```

---

#### POST `/api/v1/messages/:messageId/verify`

**Description:** Verify a message's integrity and its inclusion in a batch

**Path Parameters:**

| Parameter | Type | Description        |
| --------- | ---- | ------------------ |
| messageId | UUID | Message identifier |

**Request:**

```http
POST /api/v1/messages/770e8400-e29b-41d4-a716-446655440002/verify HTTP/1.1
Host: localhost:3000
Content-Type: application/json
```

**Response (200 OK):**

```json
{
  "messageId": "770e8400-e29b-41d4-a716-446655440002",
  "storedHash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "calculatedHash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "isValid": true,
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "batchHash": "a3f5e9b2c1d8f7e6a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1",
  "batchStatus": "complete",
  "verifiedAt": "2025-10-01T10:30:00.000Z",
  "includedInBatch": true
}
```

---

### 2.4 Device Endpoints

#### GET `/api/v1/devices`

**Description:** List all devices with statistics

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| tenantId  | string  | No       | Filter by tenant             |
| siteId    | string  | No       | Filter by site               |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 50) |

**Request:**

```http
GET /api/v1/devices?tenantId=factory1&page=1&limit=20 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "deviceId": "SENSOR_001",
      "tenantId": "factory1",
      "siteId": "line2",
      "lastSeen": "2025-10-01T10:29:55.000Z",
      "messageCount": 154789,
      "firmwareVersion": "2.1.0",
      "createdAt": "2025-09-01T08:00:00.000Z",
      "status": "active",
      "statistics": {
        "messagesLast24h": 8640,
        "averageMessagesPerHour": 360
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "totalPages": 1
  }
}
```

---

#### GET `/api/v1/devices/:deviceId`

**Description:** Get detailed information about a specific device

**Path Parameters:**

| Parameter | Type   | Description       |
| --------- | ------ | ----------------- |
| deviceId  | string | Device identifier |

**Request:**

```http
GET /api/v1/devices/SENSOR_001 HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**

```json
{
  "deviceId": "SENSOR_001",
  "tenantId": "factory1",
  "siteId": "line2",
  "lastSeen": "2025-10-01T10:29:55.000Z",
  "messageCount": 154789,
  "firmwareVersion": "2.1.0",
  "publicKey": null,
  "createdAt": "2025-09-01T08:00:00.000Z",
  "updatedAt": "2025-10-01T10:29:55.000Z",
  "statistics": {
    "messagesLast24h": 8640,
    "messagesLast7d": 60480,
    "averageMessagesPerHour": 360,
    "lastBatchId": "550e8400-e29b-41d4-a716-446655440000"
  },
  "recentActivity": [
    {
      "timestamp": "2025-10-01T10:29:55.000Z",
      "messageCount": 1,
      "batchId": "550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}
```

---

## 3. Error Responses

### 3.1 Standard Error Format

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-10-01T10:30:00.000Z",
  "path": "/api/v1/batches/invalid-uuid",
  "requestId": "req-12345-abcde"
}
```

### 3.2 HTTP Status Codes

| Status Code               | Description        | When to Use                            |
| ------------------------- | ------------------ | -------------------------------------- |
| 200 OK                    | Success            | Successful GET, POST, PUT requests     |
| 201 Created               | Resource created   | Successful resource creation           |
| 400 Bad Request           | Invalid input      | Invalid query params, malformed JSON   |
| 404 Not Found             | Resource not found | Batch/message/device doesn't exist     |
| 422 Unprocessable Entity  | Validation error   | Valid JSON but invalid business logic  |
| 500 Internal Server Error | Server error       | Database errors, unexpected exceptions |
| 503 Service Unavailable   | Service down       | MQTT/DB/Redis connection issues        |

### 3.3 Error Codes

| Code              | HTTP Status | Description                       |
| ----------------- | ----------- | --------------------------------- |
| INVALID_PARAMETER | 400         | Query parameter validation failed |
| INVALID_UUID      | 400         | UUID format is invalid            |
| BATCH_NOT_FOUND   | 404         | Batch ID doesn't exist            |
| MESSAGE_NOT_FOUND | 404         | Message ID doesn't exist          |
| DEVICE_NOT_FOUND  | 404         | Device ID doesn't exist           |
| DATABASE_ERROR    | 500         | Database operation failed         |
| MQTT_DISCONNECTED | 503         | MQTT broker not connected         |

---

## 4. Rate Limiting (Future)

For production deployment:

```
Rate Limit: 100 requests per minute per IP
Response Header: X-RateLimit-Remaining: 95
Response Header: X-RateLimit-Reset: 1696156860
```

**Response (429 Too Many Requests):**

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again in 30 seconds.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 30
}
```

---

## 5. Request Examples (cURL)

### 5.1 Get Health Status

```bash
curl -X GET http://localhost:3000/health
```

### 5.2 List Recent Batches

```bash
curl -X GET 'http://localhost:3000/api/v1/batches?page=1&limit=10&status=complete'
```

### 5.3 Get Batch Details

```bash
curl -X GET http://localhost:3000/api/v1/batches/550e8400-e29b-41d4-a716-446655440000
```

### 5.4 Verify Batch

```bash
curl -X POST http://localhost:3000/api/v1/batches/550e8400-e29b-41d4-a716-446655440000/verify
```

### 5.5 Search Messages by Device

```bash
curl -X GET 'http://localhost:3000/api/v1/messages/search?deviceId=SENSOR_001&startTime=2025-10-01T00:00:00Z&endTime=2025-10-01T23:59:59Z&limit=100'
```

### 5.6 Get Device Statistics

```bash
curl -X GET http://localhost:3000/api/v1/devices/SENSOR_001
```

---

## 6. WebSocket Support (Future Enhancement)

For real-time updates:

```javascript
// Connect to WebSocket
const ws = new WebSocket("ws://localhost:3000/ws");

// Subscribe to batch completions
ws.send(
  JSON.stringify({
    type: "subscribe",
    channel: "batch.completed",
  })
);

// Receive events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("New batch completed:", data.batchId);
};
```

---

## Document Approval

| Role         | Name        | Date    | Status |
| ------------ | ----------- | ------- | ------ |
| API Designer | [Your Name] | 2025-10 | Draft  |
| Reviewer     | TBD         | -       | -      |

---

**Next Document:** Development Plan
