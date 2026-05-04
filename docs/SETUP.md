# Smart Home Platform — Phase 1 setup

## Architecture (Phase 1)

Virtual sensors publish JSON telemetry to MQTT (`smarthome/telemetry`). The FastAPI backend subscribes, validates the unified payload, stores rows in PostgreSQL, publishes each reading to **Redis** (`telemetry:*`), and a small bridge forwards Redis messages to WebSocket clients on `/ws/live`. The Next.js dashboard loads the latest per-device readings from `GET /api/telemetry/latest` and merges live WebSocket updates.

## Prerequisites

- **Docker Desktop** (or another Docker engine) running — if you see `Cannot connect to the Docker daemon`, start Docker and retry.
- (Optional) Node 20+ and Python 3.12+ for local runs without Docker

## Quick start (Docker)

From the repo:

```bash
cd docker
cp .env.example .env
docker compose up --build
```

Leave that terminal open. In the browser:

- Landing: [http://localhost:3000/](http://localhost:3000/)
- Sign in: [http://localhost:3000/login](http://localhost:3000/login) — demo **`demo@nexus.local` / `Demo123!`** (seeded after migration **002**)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

JWT auth protects data APIs and WebSockets. The browser stores the token (Zustand `localStorage`) and sends `Authorization: Bearer …`. WebSocket URL is `/ws/live?token=…`.

### Login shows “Not Found” or never completes

**Cause:** The UI used to call **`http://localhost:3000/api/...`** and rely on a **Next.js proxy** (rewrites or a catch‑all `app/api/[...path]/route.ts`). In **standalone / Docker** builds, that proxy often **does not run** for `POST` requests the way you expect, so the browser receives **Next’s HTML 404 page** instead of JSON — the UI surfaces that as **“Not Found”**.

**Fix (current behavior):** The browser calls **FastAPI directly** at **`http://127.0.0.1:8000`** (port **8000** is published from the `backend` service). **CORS** on the API allows `http://localhost:3000` and `http://127.0.0.1:3000`. Rebuild the frontend after changes: `docker compose build frontend --no-cache && docker compose up`.

**Check the API** (should return JSON with `access_token`):

```bash
curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@nexus.local","password":"Demo123!"}'
```

Optional: set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if your API is not on `127.0.0.1:8000`.

Services (host ports):

| Service     | Port |
|------------|------|
| PostgreSQL | **5433** (default; see `POSTGRES_PORT` in `docker/.env`) |
| Redis      | **6379** (required for live WebSocket telemetry/alerts) |
| MQTT       | 1883 (WebSockets on 9001) |
| Backend    | 8000 |
| Frontend   | 3000 |

The **backend talks to Postgres inside the Docker network** (`postgres:5432`). You only need the published port (5433) when connecting from your Mac (e.g. TablePlus, `psql`).

### If Postgres fails with “address already in use” on 5432

Something on your machine is already using **5432** (often a local Postgres). This project defaults **`POSTGRES_PORT=5433`** in `docker/.env` so the container maps to **5433** on the host. If you changed it back to 5432, either stop the other Postgres or set `POSTGRES_PORT=5433` in `docker/.env`.

The **simulator** container publishes about once per second from `simulator/data/sensors_dataset.json`. The first telemetry rows appear shortly after startup. If live charts do not move, confirm **Redis** is up (the API does not push WebSocket updates from MQTT directly).

## Local development (without Docker for app code)

### Database, MQTT, and Redis

Run only infrastructure:

```bash
cd docker
docker compose up postgres mqtt redis
```

From the host, Postgres is reachable at `localhost:5433` unless you changed `POSTGRES_PORT`. Redis is on `localhost:6379`.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Defaults in .env.example: DATABASE_URL on 5433, MQTT_HOST=localhost, REDIS_URL=redis://localhost:6379/0
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Simulator

```bash
cd simulator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
MQTT_HOST=localhost INTERVAL_SEC=1 python simulator.py
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Unified telemetry payload

All producers (simulator or future ESP32) must send JSON like:

```json
{
  "device_id": "kitchen_sensor_01",
  "room": "kitchen",
  "temperature": 26.4,
  "humidity": 48.2,
  "motion": false,
  "light": 312,
  "gas": 0.21,
  "smoke": 0.03,
  "timestamp": "2026-03-29T19:10:00Z"
}
```

Nullable fields are allowed for devices that do not expose every sensor.

## Docker build: `failed to stat parent` / overlayfs snapshot

This comes from **Docker Desktop’s storage** (containerd overlayfs), not from the repo Dockerfiles. Try in order:

1. **Quit Docker Desktop fully** (menu → Quit), wait a few seconds, start it again.
2. Clear build cache, then rebuild:

   ```bash
   docker builder prune -af
   cd docker && docker compose build --no-cache && docker compose up
   ```

3. If it still fails, use the **legacy builder** (avoids some BuildKit/snapshotter bugs on Mac):

   ```bash
   cd docker
   DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose build --no-cache
   DOCKER_BUILDKIT=0 docker compose up
   ```

4. **Docker Desktop → Troubleshoot**: “Clean / Purge data” or “Reset to factory defaults” (last resort; removes unused images/containers).

Optional: **Settings → General** — turn off **“Use containerd for pulling and storing images”**, restart Docker, then retry step 2.

## Makefile shortcuts

From the repo root, `make up` runs Docker Compose in `docker/` (see root `Makefile`).
