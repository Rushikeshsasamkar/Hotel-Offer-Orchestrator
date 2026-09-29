# Hotel Offer Orchestrator

Aggregates hotel offers from two (mock) suppliers, keeps the cheapest offer per hotel, stores the result in Redis and serves it through a REST API. The fetch, merge and persist steps are orchestrated by a Temporal workflow.

Stack: Node.js 20, TypeScript, Express, Temporal (TypeScript SDK), Redis, Docker Compose.

## Architecture

```
            +---------------- docker compose ----------------+
 client --> | api (Express :3000)                             |
            |   GET /api/hotels --start+await--> temporal     |
            |   GET /supplierA/hotels  (mock)        |        |
            |   GET /supplierB/hotels  (mock)        v        |
            |   GET /health                   worker (same    |
            |        ^                        image, other cmd)|
            |        +----- HTTP (activities) ---+   |        |
            |   redis <---- saveHotelsToRedis ------+         |
            +-------------------------------------------------+
```

- `api`: `node dist/api/server.js`. Hosts the public API and the mock suppliers.
- `worker`: `node dist/worker/worker.js`. Runs `hotelOffersWorkflow` and its activities.
- `temporal`: `temporalio/temporal` dev server (UI on http://localhost:8233).
- `redis`: `redis:7-alpine` (published on host port 6390 by default, override with `REDIS_HOST_PORT`).

Request flow: the API starts the workflow and waits for it. The workflow fetches both suppliers in parallel, deduplicates with the pure function `selectBestOffers`, and atomically replaces `hotels:<city>` in Redis. The API then **always reads its response from Redis** with `ZRANGEBYSCORE`, so price filtering really happens in Redis.

## Run with Docker

```bash
docker compose up --build
```

API at http://localhost:3000, Temporal UI at http://localhost:8233.

## Run locally

```bash
docker compose up -d redis temporal      # infrastructure only
npm install
cp .env.example .env                     # then export the vars, e.g. `set -a; . ./.env; set +a`
export REDIS_URL=redis://localhost:6390  # compose publishes redis on 6390
npm run dev:worker                       # terminal 1
npm run dev:api                          # terminal 2
```

`npm run build` compiles to `dist/`; `npm run start:api` / `npm run start:worker` run the compiled output.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal frontend |
| `TASK_QUEUE` | `hotel-offers` | Temporal task queue |
| `SUPPLIER_BASE_URL` | `http://localhost:$PORT` | Where activities and `/health` reach the mock suppliers (compose: `http://api:3000`) |
| `CACHE_TTL_SECONDS` | `300` | TTL of `hotels:<city>` keys |
| `SUPPLIER_A_DOWN` / `SUPPLIER_B_DOWN` | `false` | Make a mock supplier always return 503 (health demos) |
| `WORKFLOW_TIMEOUT_MS` | `20000` | How long the API waits for the workflow before answering 503 |
| `LOG_LEVEL` | `info` | pino level |

## Endpoints

### `GET /api/hotels`

| Query | Required | Notes |
|---|---|---|
| `city` | yes | trimmed and lowercased |
| `minPrice`, `maxPrice` | no | finite numbers >= 0, `minPrice <= maxPrice`, inclusive bounds |
| `simulateFailure` | no | `supplierA`, `supplierB` or `both`. Test hook passed into the workflow |

```bash
curl 'localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=6000'
# [{"name":"Lotus Residency","price":5500,"supplier":"Supplier B","commissionPct":10},
#  {"name":"Royal Orchid","price":5800,"supplier":"Supplier B","commissionPct":9}]
```

| Status | Meaning |
|---|---|
| `200` | JSON array `[{ name, price, supplier, commissionPct }]` sorted by price ascending. Unknown city gives `[]`. If one supplier failed the list is partial and the header `X-Partial-Results: supplierA` (or `supplierB`) is set |
| `400` | `{ error }` validation failure |
| `502` | `{ error: "All suppliers unavailable" }` |
| `503` | Temporal unreachable, workflow timeout or Redis failure |

### Mock suppliers

`GET /supplierA/hotels?city=delhi`, `GET /supplierB/hotels?city=delhi`. Without `city` all hotels are returned. `?fail=true` returns `503`. Cities with data: `delhi`, `mumbai`.

### `GET /health`

Checks Supplier A, Supplier B (2s timeout, in parallel), Redis `PING` and the Temporal connection. `200` with `status: "ok"` when all are up, otherwise `503` with `status: "degraded"`.

## Redis data model

- Key `hotels:<city>` (lowercased), a sorted set. Score = `price`, member = JSON of the offer `{"name","price","supplier","commissionPct"}`.
- Written by `MULTI` / `DEL` / `ZADD`... / `EXPIRE` / `EXEC`, so readers never see a half-written set. An empty result just deletes the key.
- Read with `ZRANGEBYSCORE hotels:<city> <min|-inf> <max|+inf>`.

```bash
docker compose exec redis redis-cli ZRANGEBYSCORE hotels:delhi -inf +inf WITHSCORES
```

## Deduplication rules

Implemented in `src/domain/dedupe.ts` (pure, unit tested):

1. Hotels are the same when `name.trim().toLowerCase()` matches. The trimmed original name of the winning entry is kept.
2. The cheaper price wins.
3. On an equal price the higher `commissionPct` wins.
4. If still tied, Supplier A wins (deterministic).
5. Duplicates inside a single supplier list are resolved with the same rules.

## Failure handling

- Activities run with `startToCloseTimeout: 5s` and up to 3 attempts (200ms initial interval, backoff 2x). Each HTTP call has a 3s timeout.
- Suppliers are fetched with `Promise.allSettled`. One failure gives a partial result, both failures give a non-retryable `AllSuppliersDown` failure which the API maps to `502`.
- API and worker retry the Temporal connection on boot (30 attempts, 2s apart). SIGTERM triggers graceful shutdown.

Known trade-off: `hotels:<city>` is a shared cache, so the latest workflow run for a city overwrites the previous one. A request made with `simulateFailure` (or hitting a real partial outage) therefore leaves a partial set in Redis until the next successful request or TTL expiry. Concurrent requests for the same city can also read each other's freshest set.

## Tests

```bash
npm test
```

- `tests/dedupe.test.ts`: pure merge rules.
- `tests/hotelStore.test.ts`: real Redis (`REDIS_URL`, default `redis://localhost:6379`); skipped with a warning when unreachable.
- `tests/workflow.test.ts`: `TestWorkflowEnvironment.createTimeSkipping()` with mocked activities (both ok, one down, both down). The first run downloads the Temporal test server binary.
- `tests/api.test.ts`: supertest with the Temporal/Redis dependencies mocked.

## Postman

Import `postman/Hotel_Offer_Orchestrator.postman_collection.json` (collection variable `baseUrl=http://localhost:3000`). Every request has `pm.test` assertions. Or run it headless: `npx newman run postman/Hotel_Offer_Orchestrator.postman_collection.json`.
