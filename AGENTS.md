# Repository Guidelines

## Project Structure & Module Organization
- Source: current prototype at `mqtt_client_V1.0.js` (root).
- Documentation: `docs/` contains `architect.md`, `development-plan.md`, `system-requirements.md`.
- Planned structure (per docs): `src/` with `clients/`, `services/`, `api/`, and `utils/`. Prefer placing new code there (e.g., `src/clients/mqtt.js`).

## Build, Test, and Development Commands
- Install deps: `npm init -y && npm i mqtt` (root). Creates `package.json` and installs MQTT client.
- Run prototype: `node mqtt_client_V1.0.js`.
- Env run example: `MQTT_HOST=mqtt://localhost:1883 MQTT_USER=bridge MQTT_PASS=secret node mqtt_client_V1.0.js` (refactor to read from env when moving to `src/`).
- Lint/format (optional): if adding ESLint/Prettier, use `npm run lint` / `npm run format`.

## Coding Style & Naming Conventions
- JavaScript/Node.js, 2-space indentation, semicolons required.
- File names: kebab-case (e.g., `mqtt-client.js`, `batch-processor.js`).
- Variables/functions: camelCase; Classes: PascalCase; Constants: UPPER_SNAKE_CASE.
- Avoid hardcoded secrets; read from `process.env` with sane defaults.

## Testing Guidelines
- Framework: Jest (preferred) or Vitest.
- Test location: mirror source under `tests/` or `src/**/__tests__/**`.
- Naming: `*.test.js` (e.g., `batch-processor.test.js`).
- Commands (once configured): `npm test` runs unit tests; add coverage with `npm test -- --coverage`.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits, e.g., `feat(mqtt): add reconnect with backoff` or `fix(queue): handle empty payload`.
- Scope small, descriptive; reference issues in body (e.g., `Refs #12`).
- PRs: clear description, linked issues, steps to test locally, and logs/screenshots where useful. Keep PRs focused and incremental.

## Security & Configuration Tips
- Configure via env vars: `MQTT_HOST`, `MQTT_USER`, `MQTT_PASS`, future `REDIS_URL`, `DATABASE_URL`.
- Do not commit secrets. Use a local `.env` (gitignored) and document required keys in `docs/`.

## Architecture Overview
- See `docs/architect.md` for planned components (MQTT client, Redis queue, batch processor, hashing, PostgreSQL, REST API). Align new modules and directories with that design.
