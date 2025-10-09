# MQTT Bridge with Solana Blockchain Integration

This service ingests MQTT messages, buffers via Redis Streams, batches and hashes them, persists to PostgreSQL, and **records batch proofs on Solana blockchain** for tamper-proof verification.

## 🚀 Features

- **MQTT Message Ingestion**: Subscribe to topics and receive real-time messages
- **Redis Stream Buffering**: Reliable message queuing with consumer groups
- **Batch Processing**: Configurable batch size and timeout
- **Cryptographic Hashing**: SHA-256 hashing for message and batch integrity
- **PostgreSQL Storage**: Persistent storage with full message history
- **Solana Blockchain Integration**:
  - Automatic batch recording to Solana blockchain
  - Retry mechanism for failed transactions
  - On-chain verification of batch integrity
  - Explorer links for transparency
- **REST API**: Health checks, metrics, batch queries, and blockchain verification
- **Web Verification UI**: Public-facing page to verify batches on blockchain

## 🏗️ Architecture

```
MQTT Messages → Redis Stream → Batch Processor → PostgreSQL
                                       ↓
                              BlockchainService → Solana Blockchain
                                       ↓
                                  Retry Queue
```

## 🔧 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js v18+ (for development)
- Solana wallet with devnet SOL (for blockchain features)

### 1. Start Infrastructure

```bash
# Copy environment configuration
cp .env.example .env

# Start services (Mosquitto, Redis, PostgreSQL)
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 2. Configure Solana (Optional but Recommended)

```bash
# Copy devnet configuration
cp .env.devnet .env

# Generate wallet if you don't have one
node scripts/generate-wallet.js

# Request SOL from devnet faucet
node scripts/request-airdrop.js

# Check balance
./scripts/devnet.sh node scripts/check-balance.js
```

See [SOLANA_SETUP.md](./SOLANA_SETUP.md) for detailed Solana setup instructions.

### 3. Start the Application

```bash
# Install dependencies
npm install

# Run application
npm start
```

The service will:

- Connect to MQTT broker
- Initialize database schema
- Start BlockchainService (if enabled)
- Begin processing messages
- Expose API on port 3000

## 📡 Service Endpoints

### Infrastructure Services

- **Mosquitto MQTT**: `localhost:1883` (user: `bridge`, pass: `bridge123`)
- **Redis**: `localhost:6379`
- **PostgreSQL**: `localhost:5432` (db/user/pass: `mqtt`)
- **API**: `http://localhost:3000`

### API Endpoints

#### Health & Metrics

- `GET /health` - Service health check
- `GET /metrics` - Prometheus metrics
- `GET /api/v1/blockchain/health` - Blockchain health status
- `GET /api/v1/blockchain/stats` - Blockchain statistics

#### Batch Operations

- `GET /api/v1/batches` - List batches (pagination: `?limit=20&offset=0`)
- `GET /api/v1/batches/:id` - Get specific batch
- `GET /api/v1/messages` - List messages

#### Blockchain Operations

- `GET /api/v1/blockchain/batches/:id` - Get batch blockchain info
- `GET /api/v1/blockchain/verify/:id` - Verify batch on blockchain
- `GET /verify?batchId=<id>` - Web verification page

## 🧪 Testing

### Publish Test Messages

```bash
# Single message
mosquitto_pub -h localhost -p 1883 \
  -u bridge -P bridge123 \
  -t "mqtt/things/device-1/data" \
  -m '{"temperature":25.5,"humidity":60}'

# Batch messages (triggers batch creation)
npm run publish:demo -- --count=1000 --interval=10
```

### Run Integration Tests

```bash
# Test blockchain service
./scripts/devnet.sh node scripts/test-blockchain-service.js

# Full integration test
./scripts/devnet.sh node scripts/test-integration.js
```

### API Testing

```bash
# Health check
curl http://localhost:3000/health

# Blockchain health
curl http://localhost:3000/api/v1/blockchain/health | jq

# List recent batches
curl http://localhost:3000/api/v1/batches?limit=5 | jq

# Verify specific batch
curl http://localhost:3000/api/v1/blockchain/verify/<batch-id> | jq
```

Import `docs/postman/BridgePoC.postman_collection.json` into Postman for complete API testing.

## ⚙️ Configuration

### Environment Variables

```bash
# MQTT Configuration
MQTT_HOST=mqtt://mosquitto:1883
MQTT_USER=bridge
MQTT_PASS=bridge123
MQTT_TOPIC_FILTER=mqtt/things/#

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_STREAM=mqtt:messages
REDIS_GROUP=bridge

# PostgreSQL Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=mqtt
POSTGRES_USER=mqtt
POSTGRES_PASSWORD=mqtt

# Batching Configuration
BATCH_SIZE=1000                    # Messages per batch
BATCH_TIMEOUT_MS=300000            # 5 minutes

# Solana Configuration
SOLANA_ENABLED=true                # Enable/disable blockchain
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet              # devnet/testnet/mainnet-beta
SOLANA_PRIVATE_KEY=<base58-key>    # Wallet private key

# Blockchain Service
BLOCKCHAIN_RETRY_INTERVAL_MS=300000  # 5 minutes
BLOCKCHAIN_MAX_RETRIES=10
```

## 🔒 Security Considerations

- **Private Keys**: Never commit private keys to git. Store in environment variables or secure vaults.
- **RPC Endpoints**: Use authenticated endpoints for production.
- **MQTT Credentials**: Change default credentials in production.
- **Database**: Use strong passwords and restrict network access.

## 📊 Monitoring

### Prometheus Metrics

Available at `http://localhost:3000/metrics`:

- `mqtt_messages_received` - Total MQTT messages received
- `mqtt_messages_processed` - Messages successfully processed
- `current_batch_size` - Current batch message count
- `batches_completed` - Total batches completed
- `blockchain_attempts` - Blockchain recording attempts
- `blockchain_success` - Successful blockchain recordings
- `blockchain_failures` - Failed blockchain recordings

### Logs

Structured JSON logs include:

- Message processing events
- Batch completion events
- Blockchain transaction events
- Retry queue processing
- Error details

## 📚 Documentation

- **[Quick Start Guide](./docs/solana-integration/QUICK-START.md)** - Comprehensive testing guide
- **[Implementation Complete](./docs/solana-integration/IMPLEMENTATION-COMPLETE.md)** - Full integration details
- **[Solana Setup](./SOLANA_SETUP.md)** - Wallet and devnet configuration
- **[Technical Architecture](./docs/solana-integration/Solana-02-technical-architecture.md)** - System design
- **[API Specification](./docs/bridge-service/04-api-specification.md)** - Complete API reference
- **[Development Plan](./docs/solana-integration/Solana-03-development-plan.md)** - Implementation roadmap

## 🎯 Use Cases

1. **IoT Device Data Integrity**: Verify sensor data hasn't been tampered with
2. **Supply Chain Tracking**: Immutable proof of events and timestamps
3. **Audit Trails**: Cryptographically verifiable event logs
4. **Data Provenance**: Prove data origin and authenticity
5. **Compliance**: Meet regulatory requirements for data integrity

## 🚀 Deployment

### Development (Devnet)

```bash
# Use devnet configuration
cp .env.devnet .env
npm start
```

### Production (Mainnet)

1. Generate production wallet securely
2. Fund wallet with SOL for transaction fees
3. Update `.env` with mainnet configuration:
   ```bash
   SOLANA_NETWORK=mainnet-beta
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # Or paid provider
   ```
4. Deploy with proper key management (AWS KMS, HashiCorp Vault)
5. Set up monitoring and alerting

## 🤝 Contributing

Contributions are welcome! See [AGENTS.md](./AGENTS.md) for coding guidelines.

## 📝 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- [Solana Web3.js](https://github.com/solana-labs/solana-web3.js) - Solana JavaScript SDK
- [MQTT.js](https://github.com/mqttjs/MQTT.js) - MQTT client for Node.js
- [node-postgres](https://github.com/brianc/node-postgres) - PostgreSQL client

---

**Status**: ✅ Production Ready for Devnet  
**Last Updated**: October 2, 2025  
**Version**: 2.0.0 (with Solana Integration)
