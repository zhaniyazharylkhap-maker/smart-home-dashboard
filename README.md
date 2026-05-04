# AI-powered IoT Smart Home Digital Twin Platform

Monorepo for a smart home SaaS MVP: **Python simulator → MQTT → FastAPI → PostgreSQL → Redis → WebSocket → Next.js**.

## Structure

| Path        | Description                                      |
|------------|---------------------------------------------------|
| `backend/` | FastAPI, SQLAlchemy, Alembic, MQTT consumer, WS   |
| `frontend/`| Next.js (App Router) dashboard                    |
| `simulator/` | Virtual devices publishing unified telemetry   |
| `docker/`  | `docker-compose` (Postgres, Mosquitto, services)  |
| `docs/`    | Setup and architecture notes                      |

## Run

See **[docs/SETUP.md](docs/SETUP.md)** for Docker and local development.

### Whole project on your machine (Docker)

1. Start **Docker Desktop**.
2. From the repo:

```bash
cd docker
cp .env.example .env   # once; POSTGRES_PORT=5433 avoids clashing with local Postgres
docker compose up --build
```

3. Wait until **backend**, **frontend**, **postgres**, **redis**, **mqtt**, and **simulator** are running (simulator pushes telemetry ~1/s).
4. Open **http://localhost:3000/login** — demo user **`demo@nexus.local` / `Demo123!`** (see SETUP). The UI talks to the API at **http://127.0.0.1:8000**; live tiles need **Redis** (included in compose).
5. Use the dashboard (**/dashboard**, **/telemetry**, etc.). API docs: **http://127.0.0.1:8000/docs**.

If `docker compose` errors on port **5432**, ensure `docker/.env` contains `POSTGRES_PORT=5433` (or stop the other process using 5432).

## Phase 2 (current)

JWT auth (register/login), rooms/devices/alerts/telemetry-history APIs, stats + alert rules on ingest, sidebar shell, landing page, telemetry charts (Recharts), devices and alerts tables — all backed by PostgreSQL.

Run migrations through **002** (`users`, `alerts`, `thresholds`) after pulling. Docker Compose passes `JWT_SECRET` into the backend service.
