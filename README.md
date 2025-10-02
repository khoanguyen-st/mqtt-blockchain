# MQTT Bridge PoC

This PoC ingests MQTT messages, buffers via Redis Streams, batches and hashes them, and persists to PostgreSQL. An Express API exposes health, metrics, and simple queries.

## Run with Docker Compose
- Copy `.env.example` to `.env` and adjust if needed.
- Start stack: `docker compose up --build`
- Publish a test MQTT message to `mosquitto`: use any MQTT client targeting `localhost:1883`.
- API: `http://localhost:3000/health` and `http://localhost:3000/metrics`.

## Services
- Mosquitto: `localhost:1883`
- Redis: `localhost:6379`
- PostgreSQL: `localhost:5432` (db/user/pass: `mqtt`)

## Dev (no containers)
Install dependencies, then run:

```
npm install
node src/index.js
```

Configure via environment variables (see `.env.example`).

## Testing Tools
- Demo publisher: `npm run publish:demo` (env: `MQTT_HOST`, optional `DEVEUI`; flags: `--topic=...`, `--count=10`, `--interval=500`).
- Postman: import `docs/postman/BridgePoC.postman_collection.json` and hit the health, metrics, and query endpoints.
