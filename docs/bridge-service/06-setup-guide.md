# Setup Guide - MQTT Bridge Service PoC

**Version:** 1.0  
**Date:** October 2025  
**Status:** Draft  
**Scope:** Local Development Environment

---

## 1. Prerequisites

### 1.1 Required Software

| Software             | Version          | Purpose             | Installation                                   |
| -------------------- | ---------------- | ------------------- | ---------------------------------------------- |
| Node.js              | 18.x or 20.x LTS | Runtime environment | https://nodejs.org                             |
| Docker Desktop       | Latest           | Run dependencies    | https://www.docker.com/products/docker-desktop |
| Git                  | Latest           | Version control     | https://git-scm.com                            |
| VSCode (recommended) | Latest           | Code editor         | https://code.visualstudio.com                  |

### 1.2 System Requirements

- **OS:** macOS, Linux, or Windows with WSL2
- **RAM:** Minimum 8GB (4GB available for Docker)
- **Disk Space:** Minimum 10GB free
- **Network:** Internet connection for initial setup

### 1.3 Verify Installations

```bash
# Check Node.js version
node --version
# Expected: v18.x.x or v20.x.x

# Check npm version
npm --version
# Expected: 9.x.x or 10.x.x

# Check Docker version
docker --version
# Expected: Docker version 24.x.x or higher

# Check Docker Compose
docker compose version
# Expected: Docker Compose version v2.x.x

# Check Git
git --version
# Expected: git version 2.x.x
```

---

## 2. Project Structure Setup

### 2.1 Create Project Directory

```bash
# Create project root
mkdir mqtt-blockchain-bridge
cd mqtt-blockchain-bridge

# Create directory structure
mkdir -p src/{clients,services,api/{routes,middleware},config,utils}
mkdir -p tests/{unit,integration,e2e}
mkdir -p docker
mkdir -p scripts
mkdir -p docs
mkdir -p logs
```

### 2.2 Final Directory Structure

```
mqtt-blockchain-bridge/
├── src/
│   ├── index.js                 # Main entry point
│   ├── config/
│   │   └── index.js             # Configuration loader
│   ├── clients/
│   │   ├── mqtt.js              # MQTT client wrapper
│   │   ├── redis.js             # Redis client wrapper
│   │   └── database.js          # PostgreSQL pool
│   ├── services/
│   │   ├── messageParser.js     # Parse & validate messages
│   │   ├── messageQueue.js      # Queue operations
│   │   ├── batchProcessor.js    # Batching logic
│   │   ├── hashGenerator.js     # Hash generation
│   │   └── storage.js           # Database operations
│   ├── api/
│   │   ├── server.js            # Express app
│   │   ├── routes/
│   │   │   ├── health.js        # Health endpoint
│   │   │   ├── batches.js       # Batch endpoints
│   │   │   ├── messages.js      # Message endpoints
│   │   │   └── devices.js       # Device endpoints
│   │   └── middleware/
│   │       ├── errorHandler.js  # Error handling
│   │       └── requestLogger.js # Request logging
│   └── utils/
│       ├── logger.js            # Winston logger
│       ├── metrics.js           # Prometheus client
│       └── shutdown.js          # Graceful shutdown
├── tests/
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
├── docker/
│   ├── docker-compose.yml       # Docker services
│   └── mosquitto/
│       └── config/
│           └── mosquitto.conf   # Mosquitto config
├── scripts/
│   ├── 001_initial_schema.sql   # Database schema
│   ├── 002_seed_data.sql        # Test data
│   └── setup-db.sh              # Database setup script
├── docs/                        # Documentation
├── logs/                        # Application logs
├── .env.example                 # Environment template
├── .gitignore
├── package.json
├── README.md
└── CHANGELOG.md
```

---

## 3. Initialize Node.js Project

### 3.1 Create package.json

```bash
npm init -y
```

### 3.2 Install Dependencies

```bash
# Core dependencies
npm install mqtt express pg ioredis winston prom-client dotenv uuid

# Development dependencies
npm install --save-dev jest supertest eslint prettier nodemon
```

### 3.3 Update package.json Scripts

Edit `package.json` and add these scripts:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "lint": "eslint src tests",
    "lint:fix": "eslint src tests --fix",
    "format": "prettier --write \"src/**/*.js\" \"tests/**/*.js\"",
    "db:setup": "bash scripts/setup-db.sh",
    "docker:up": "docker compose -f docker/docker-compose.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yml down",
    "docker:logs": "docker compose -f docker/docker-compose.yml logs -f"
  }
}
```

---

## 4. Docker Setup

### 4.1 Create docker-compose.yml

Create `docker/docker-compose.yml`:

```yaml
version: "3.8"

services:
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: veep-mosquitto
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto/config/mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data
      - mosquitto_logs:/mosquitto/log
    networks:
      - bridge-network
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    container_name: veep-postgres
    environment:
      POSTGRES_DB: veep_bridge
      POSTGRES_USER: bridge
      POSTGRES_PASSWORD: bridge_dev_password_123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ../scripts:/docker-entrypoint-initdb.d
    networks:
      - bridge-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bridge -d veep_bridge"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: veep-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - bridge-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mosquitto_data:
  mosquitto_logs:
  postgres_data:
  redis_data:

networks:
  bridge-network:
    driver: bridge
```

### 4.2 Create Mosquitto Configuration

Create `docker/mosquitto/config/mosquitto.conf`:

```conf
# Mosquitto Configuration for VEEP Bridge PoC

# Listener on port 1883 (MQTT)
listener 1883
protocol mqtt

# Allow anonymous connections for PoC
allow_anonymous true

# Persistence
persistence true
persistence_location /mosquitto/data/

# Logging
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information

# Connection settings
max_connections -1
```

### 4.3 Start Docker Services

```bash
# Start all services
npm run docker:up

# Check services are running
docker ps

# Expected output: mosquitto, postgres, redis all in "Up" status

# View logs
npm run docker:logs

# Or for specific service
docker logs veep-postgres -f
```

---

## 5. Database Setup

### 5.1 Create Database Schema Script

Create `scripts/001_initial_schema.sql`:

```sql
-- Create database (if not exists)
-- Note: This runs automatically via docker-entrypoint-initdb.d

-- Create devices table
CREATE TABLE devices (
    device_id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL,
    site_id VARCHAR(100) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message_count BIGINT DEFAULT 0,
    public_key VARCHAR(88),
    firmware_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create batches table
CREATE TABLE batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_hash VARCHAR(64) NOT NULL,
    message_count INTEGER NOT NULL CHECK (message_count > 0),
    start_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    end_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    solana_tx_signature VARCHAR(88),
    solana_block_number BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT check_timestamps CHECK (end_timestamp >= start_timestamp),
    CONSTRAINT check_status CHECK (status IN ('pending', 'hashing', 'complete', 'failed', 'blockchain_pending', 'blockchain_confirmed'))
);

-- Create messages table
CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES batches(batch_id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    message_hash VARCHAR(64) NOT NULL,
    raw_data JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_batch FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
    CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

-- Create indexes for batches
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batches_created_at ON batches(created_at DESC);
CREATE INDEX idx_batches_hash ON batches(batch_hash);

-- Create indexes for messages
CREATE INDEX idx_messages_batch_id ON messages(batch_id);
CREATE INDEX idx_messages_device_id ON messages(device_id);
CREATE INDEX idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX idx_messages_hash ON messages(message_hash);
CREATE INDEX idx_messages_raw_data ON messages USING GIN (raw_data);

-- Create indexes for devices
CREATE INDEX idx_devices_tenant_site ON devices(tenant_id, site_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);

-- Insert success message
DO $$
BEGIN
    RAISE NOTICE 'Database schema created successfully!';
END $$;
```

### 5.2 Create Seed Data Script

Create `scripts/002_seed_data.sql`:

```sql
-- Seed test devices
INSERT INTO devices (device_id, tenant_id, site_id, firmware_version) VALUES
    ('SENSOR_001', 'factory1', 'line1', '2.1.0'),
    ('SENSOR_002', 'factory1', 'line1', '2.1.0'),
    ('SENSOR_003', 'factory1', 'line2', '2.1.0'),
    ('SENSOR_004', 'factory2', 'line1', '2.0.5'),
    ('SENSOR_005', 'factory2', 'line1', '2.0.5')
ON CONFLICT (device_id) DO NOTHING;

-- Insert success message
DO $$
BEGIN
    RAISE NOTICE 'Seed data inserted successfully!';
END $$;
```

### 5.3 Verify Database Setup

```bash
# Connect to PostgreSQL
docker exec -it veep-postgres psql -U bridge -d veep_bridge

# Run queries to verify
veep_bridge=# \dt
# Expected: devices, batches, messages tables

veep_bridge=# SELECT * FROM devices;
# Expected: 5 test devices

veep_bridge=# \q
# Exit
```

---

## 6. Environment Configuration

### 6.1 Create .env.example

Create `.env.example`:

```bash
# MQTT Configuration
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_TOPICS=veep/+/+/+/data

# Batching Configuration
BATCH_SIZE=1000
BATCH_TIMEOUT_MS=300000

# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=veep_bridge
DATABASE_USER=bridge
DATABASE_PASSWORD=bridge_dev_password_123
DATABASE_POOL_SIZE=10

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_STREAM_NAME=mqtt:messages
REDIS_CONSUMER_GROUP=batch-processor

# API Configuration
API_PORT=3000
API_HOST=0.0.0.0

# Logging Configuration
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring Configuration
METRICS_PORT=9090
```

### 6.2 Create .env for Local Development

```bash
# Copy example and customize
cp .env.example .env

# Edit .env if needed (optional for PoC)
```

---

## 7. Git Setup

### 7.1 Create .gitignore

Create `.gitignore`:

```
# Node modules
node_modules/

# Environment variables
.env
.env.local

# Logs
logs/
*.log
npm-debug.log*

# Test coverage
coverage/
.nyc_output/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Docker volumes (keep data local)
docker/mosquitto/data/
docker/mosquitto/logs/

# Build output
dist/
build/

# Temporary files
tmp/
temp/
```

### 7.2 Initialize Git Repository

```bash
# Initialize Git
git init

# Add all files
git add .

# First commit
git commit -m "Initial project setup"
```

---

## 8. Testing MQTT Connection

### 8.1 Install MQTT Client Tools

```bash
# macOS
brew install mosquitto

# Linux (Ubuntu/Debian)
sudo apt-get install mosquitto-clients

# Windows (via Chocolatey)
choco install mosquitto
```

### 8.2 Test Publishing Messages

```bash
# Publish a test message
mosquitto_pub -h localhost -p 1883 \
  -t "veep/factory1/line1/SENSOR_001/data" \
  -m '{"deviceId":"SENSOR_001","timestamp":1696156800,"kwh":15.7,"voltage":220.1}'

# Expected: No errors

# Subscribe to verify
mosquitto_sub -h localhost -p 1883 -t "veep/+/+/+/data" -v

# In another terminal, publish again
mosquitto_pub -h localhost -p 1883 \
  -t "veep/factory1/line1/SENSOR_001/data" \
  -m '{"deviceId":"SENSOR_001","timestamp":1696156801,"kwh":15.8,"voltage":220.2}'

# Expected: You should see the message in the subscriber terminal
```

---

## 9. Basic Code Templates

### 9.1 Configuration Loader

Create `src/config/index.js`:

```javascript
require("dotenv").config();

const config = {
  mqtt: {
    url: process.env.MQTT_BROKER_URL || "mqtt://localhost:1883",
    username: process.env.MQTT_USERNAME || "",
    password: process.env.MQTT_PASSWORD || "",
    topics: process.env.MQTT_TOPICS || "veep/+/+/+/data",
  },
  batch: {
    size: parseInt(process.env.BATCH_SIZE) || 1000,
    timeoutMs: parseInt(process.env.BATCH_TIMEOUT_MS) || 300000,
  },
  database: {
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || "veep_bridge",
    user: process.env.DATABASE_USER || "bridge",
    password: process.env.DATABASE_PASSWORD || "",
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE) || 10,
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    streamName: process.env.REDIS_STREAM_NAME || "mqtt:messages",
    consumerGroup: process.env.REDIS_CONSUMER_GROUP || "batch-processor",
  },
  api: {
    port: parseInt(process.env.API_PORT) || 3000,
    host: process.env.API_HOST || "0.0.0.0",
  },
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
  },
  metrics: {
    port: parseInt(process.env.METRICS_PORT) || 9090,
  },
};

module.exports = config;
```

### 9.2 Logger Setup

Create `src/utils/logger.js`:

```javascript
const winston = require("winston");
const config = require("../config");

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.logging.format === "json"
      ? winston.format.json()
      : winston.format.simple()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),
  ],
});

module.exports = logger;
```

### 9.3 Main Entry Point

Create `src/index.js`:

```javascript
const config = require("./config");
const logger = require("./utils/logger");

async function main() {
  logger.info("Starting MQTT Bridge Service", {
    version: require("../package.json").version,
    environment: process.env.NODE_ENV || "development",
  });

  // TODO: Initialize components
  // - Database connection
  // - Redis connection
  // - MQTT client
  // - Batch processor
  // - API server

  logger.info("Bridge Service started successfully", {
    apiPort: config.api.port,
    metricsPort: config.metrics.port,
  });
}

// Handle errors
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection", { error });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error("Failed to start application", { error });
  process.exit(1);
});
```

---

## 10. Verification Checklist

Before starting development, verify:

```bash
# 1. Check Docker services
docker ps
# ✓ mosquitto, postgres, redis all running

# 2. Check database
docker exec -it veep-postgres psql -U bridge -d veep_bridge -c "\dt"
# ✓ devices, batches, messages tables exist

# 3. Check MQTT
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello"
# ✓ No errors

# 4. Check Node.js project
npm list --depth=0
# ✓ All dependencies installed

# 5. Check environment
node -e "console.log(require('./src/config'))"
# ✓ Configuration loaded correctly

# 6. Run basic test
node src/index.js
# ✓ Application starts without errors
```

---

## 11. Next Steps

1. **Start Development:**

   ```bash
   npm run dev
   ```

2. **Follow Development Plan:**

   - Week 1: Foundation (MQTT client, database)
   - Week 2: Core functionality (batching, hashing)
   - Week 3: Integration (API, end-to-end)
   - Week 4: Testing & documentation

3. **Monitor Logs:**

   ```bash
   tail -f logs/combined.log
   ```

4. **Test as You Go:**
   ```bash
   npm test
   ```

---

## 12. Troubleshooting

### 12.1 Docker Issues

**Problem:** Containers won't start

```bash
# Solution: Check Docker daemon
docker info

# Restart Docker Desktop

# Remove old containers and volumes
docker compose -f docker/docker-compose.yml down -v
npm run docker:up
```

**Problem:** Port already in use

```bash
# Solution: Find and kill process using port
lsof -i :5432  # or :1883, :6379
kill -9

# Or change port in docker-compose.yml
```

### 12.2 Database Issues

**Problem:** Can't connect to database

```bash
# Solution: Check if PostgreSQL is ready
docker exec -it veep-postgres pg_isready -U bridge

# Check logs
docker logs veep-postgres

# Recreate database
docker compose -f docker/docker-compose.yml down -v postgres
npm run docker:up
```

### 12.3 MQTT Issues

**Problem:** Can't publish/subscribe

```bash
# Solution: Check Mosquitto logs
docker logs veep-mosquitto

# Test with verbose output
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello" -d

# Check config
docker exec -it veep-mosquitto cat /mosquitto/config/mosquitto.conf
```

### 12.4 Node.js Issues

**Problem:** Module not found

```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Problem:** Permission denied on logs/

```bash
# Solution: Create logs directory
mkdir -p logs
chmod 755 logs
```

---

## 13. Useful Commands Reference

```bash
# Start development
npm run dev

# Run tests
npm test

# Docker management
npm run docker:up      # Start all services
npm run docker:down    # Stop all services
npm run docker:logs    # View logs

# Database
npm run db:setup       # Setup database

# Code quality
npm run lint           # Check code
npm run lint:fix       # Fix code issues
npm run format         # Format code

# View logs
tail -f logs/combined.log
tail -f logs/error.log

# Connect to services
docker exec -it veep-postgres psql -U bridge -d veep_bridge
docker exec -it veep-redis redis-cli
docker exec -it veep-mosquitto sh

# Monitor resources
docker stats

# Cleanup everything
docker compose -f docker/docker-compose.yml down -v
rm -rf node_modules logs/*.log
```

---

## Document Approval

| Role     | Name        | Date    | Status |
| -------- | ----------- | ------- | ------ |
| DevOps   | [Your Name] | 2025-10 | Draft  |
| Reviewer | TBD         | -       | -      |

---

**You're now ready to start development! Follow the Development Plan (05-development-plan.md) for the week-by-week breakdown.**
