# Hotel Offer Orchestrator — Implementation Plan

Source: `Assessment - Backend + Redis.docx`
Stack: Node.js 20 + TypeScript, Express, Temporal (TS SDK), Redis, Docker Compose.

## 1. Architecture

```
            ┌──────────────── docker compose ────────────────┐
 client ──► │ api (Express :3000)                             │
            │   GET /api/hotels ──start+await──► temporal     │
            │   GET /supplierA/hotels  (mock)       │         │
            │   GET /supplierB/hotels  (mock)       ▼         │
            │   GET /health                  worker (same     │
            │        ▲                        image, diff cmd)│
            │        └──── HTTP (activities) ───┘  │          │
            │   redis ◄──── saveToRedis activity ──┘          │
            └─────────────────────────────────────────────────┘
```

- **One image, two processes**: `api` (`node dist/api/server.js`) and `worker` (`node dist/worker/worker.js`).
- **temporal**: `temporalio/temporal` image, `server start-dev --ip 0.0.0.0` (verify tag exists; fallback `temporalio/auto-setup` + postgres). Expose 7233 and UI 8233.
- **redis**: `redis:7-alpine`.
- Worker reaches mocks via `SUPPLIER_BASE_URL=http://api:3000`.

## 2. Project layout

```
src/
  config.ts                 env parsing (PORT, REDIS_URL, TEMPORAL_ADDRESS, TASK_QUEUE, SUPPLIER_BASE_URL, CACHE_TTL_SECONDS)
  logger.ts                 pino (structured JSON logs)
  types.ts                  SupplierHotel, HotelOffer, WorkflowInput/Output
  domain/dedupe.ts          PURE function selectBestOffers(a[], b[]) — unit tested
  mocks/data.ts             static hotel data for Supplier A & B
  mocks/routes.ts           /supplierA/hotels, /supplierB/hotels
  api/routes/hotels.ts      /api/hotels (validation, start workflow, read Redis)
  api/routes/health.ts      /health
  api/app.ts                express app factory (for supertest)
  api/server.ts             bootstrap
  temporal/client.ts        Temporal Client singleton
  temporal/workflows.ts     hotelOffersWorkflow (NO I/O, NO node imports)
  temporal/activities.ts    fetchSupplierA/B, saveHotelsToRedis
  redis/client.ts           ioredis singleton
  redis/hotelStore.ts       save(city, offers), query(city, min, max)
  worker/worker.ts          Temporal Worker bootstrap
tests/                      jest: dedupe unit, hotelStore (redis), workflow (TestWorkflowEnvironment), api (supertest)
postman/Hotel_Offer_Orchestrator.postman_collection.json
Dockerfile, docker-compose.yml, .dockerignore, README.md, .env.example
```

## 3. Behaviour spec (decisions resolving spec ambiguities)

### Mock suppliers
- `GET /supplierA/hotels?city=<city>` / `GET /supplierB/hotels?city=<city>` → static arrays filtered by city (case-insensitive). Without `city` → all hotels.
- Data: cities `delhi` (≥5 hotels each, ≥3 overlapping names, overlap wins split between A and B, include one exact-price tie) and `mumbai`. Some city (e.g. `atlantis`) has none → `[]`.
- **Failure simulation hook**: `?fail=true` makes the mock return `503`. Also env `SUPPLIER_A_DOWN` / `SUPPLIER_B_DOWN=true` for health demos.

### GET /api/hotels
- Query: `city` (required, trimmed, lowercased), `minPrice`, `maxPrice` (optional, finite numbers ≥0, min ≤ max), `simulateFailure` (optional: `supplierA` | `supplierB` | `both` — test hook, passed into workflow input).
- Validation failure → `400 { error }`.
- Flow: start `hotelOffersWorkflow` (workflowId `hotels-<city>-<uuid>`, taskQueue from config) and `await handle.result()` → workflow persists to Redis → API **always reads the response from Redis** via `ZRANGEBYSCORE hotels:<city> <min|-inf> <max|+inf>`. (Redis is the single read path, so filtering genuinely happens in Redis.)
- Response: `200` JSON array exactly `[{ name, price, supplier, commissionPct }]` sorted by price asc. No-results city → `200 []`.
- Both suppliers failed → `502 { error: "All suppliers unavailable" }`. One failed → `200` with partial list + response header `X-Partial-Results: supplierA` (keep body shape as spec).
- Temporal unreachable / timeout → `503`.

### Workflow `hotelOffersWorkflow({ city, simulateFailure? })`
- `proxyActivities` with `startToCloseTimeout: '5s'`, `retry: { maximumAttempts: 3, initialInterval: '200ms', backoffCoefficient: 2 }`.
- Run `fetchSupplierA` and `fetchSupplierB` in parallel with `Promise.allSettled`.
- Both rejected → throw `ApplicationFailure.nonRetryable('All suppliers unavailable', 'AllSuppliersDown')`.
- `selectBestOffers(aResults, bResults)` (pure, imported into workflow — deterministic).
- Call `saveHotelsToRedis(city, offers)` activity.
- Return `{ offers, failedSuppliers: string[] }`.
- Use `workflow.log` for logging (not console).

### Dedupe rules (`selectBestOffers`)
- Key = `name.trim().toLowerCase()`; output keeps the original display name.
- Cheaper price wins. **Tie** → higher `commissionPct`; still tied → Supplier A (deterministic). Document in README.
- Also dedupe within a single supplier's list (same rule) — defensive.
- Output shape: `{ name, price, supplier: 'Supplier A' | 'Supplier B', commissionPct }`.

### Activities
- `fetchSupplierA/B(city, fail)`: `fetch(`${SUPPLIER_BASE_URL}/supplierX/hotels?city=..&fail=..`)` with AbortController timeout ~3s; non-2xx → throw (retryable); validate/shape payload; log attempt + count.
- `saveHotelsToRedis(city, offers)`: `MULTI` → `DEL hotels:<city>` → `ZADD hotels:<city> price JSON(offer)` for each → `EXPIRE hotels:<city> CACHE_TTL_SECONDS (default 300)` → `EXEC`. Atomic replace so readers never see a half-written set. Empty list → just DEL (reader gets []).
- Member = JSON string of the offer (unique per name after dedupe, so no ZSET member collision).

### /health
- Pings Supplier A and Supplier B mock endpoints (in parallel, 2s timeout), Redis `PING`, Temporal connection check.
- `200` if all up, else `503`. Body: `{ status: 'ok'|'degraded', suppliers: { supplierA: {status, latencyMs}, supplierB: {...} }, redis: {...}, temporal: {...} }`.

### Error handling & logging
- Central Express error middleware → JSON errors, no stack leakage.
- pino-http request logging.
- Graceful shutdown (SIGTERM) for api and worker.

## 4. DevOps
- **Dockerfile**: multi-stage (`node:20-bookworm-slim` build → `npm ci --omit=dev` runtime). Use bookworm-slim, NOT alpine (Temporal core-bridge native binary needs glibc). Non-root user.
- **Worker workflow bundling**: `workflowsPath: require.resolve('../temporal/workflows')` resolving to compiled JS in `dist/` — must work inside the container.
- **docker-compose.yml**: services `redis`, `temporal`, `api`, `worker`, with healthchecks and `depends_on: condition: service_healthy`. Worker/api must retry Temporal connection on boot (temporal takes a few seconds).
- `docker compose up --build` is the one-command start.

## 5. Postman collection (v2.1)
Collection variable `baseUrl=http://localhost:3000`. Requests with test scripts (`pm.test`):
1. Delhi — overlaps (asserts 200, array, no duplicate names, each overlapping hotel has the cheaper price)
2. Delhi — price filter min/max (asserts every price within range)
3. Delhi — only minPrice; only maxPrice
4. City with no results (`atlantis`) → `[]`
5. Missing city → 400; invalid range (min > max) → 400
6. Supplier A down (`simulateFailure=supplierA`) → 200, all supplier === 'Supplier B'
7. Both suppliers down → 502
8. Mock Supplier A / B direct
9. Health

## 6. README
Overview, architecture diagram, run with Docker (`docker compose up --build`), run locally (redis + temporal via compose, `npm run dev:api`, `npm run dev:worker`), env vars table, endpoint docs with examples, Redis data model, dedupe/tie rules, failure handling, tests, Postman import, Temporal UI at http://localhost:8233.

## 7. Acceptance checks (Opus will verify)
- [x] `npm run build` and `npm test` pass
- [x] `docker compose up --build -d` → all services healthy
- [x] `curl 'localhost:3000/api/hotels?city=delhi'` → deduped, cheapest per name
- [x] `...&minPrice=5000&maxPrice=6000` → filtered; `redis-cli ZRANGEBYSCORE` confirms data lives in Redis
- [x] `city=atlantis` → `[]`; `simulateFailure=supplierA` → partial; `both` → 502
- [x] `/health` reports both suppliers
- [x] Workflow executions visible in Temporal UI
- [x] Postman collection is valid v2.1 JSON
