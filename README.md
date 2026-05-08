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

Run migrations through **008** (`users`, `alerts`, `thresholds`, multi-tenant `user_id` scoping, sensor-unit-aligned alert thresholds) after pulling. Docker Compose passes `JWT_SECRET` into the backend service.

## ML pipeline (contextual anomaly detection)

The trained model artifacts (`*.pkl`, `*.npy`) are **not** committed to the repo — they are reproducible from source data and would otherwise add ~30 MB per push. Regenerate them after cloning if you want live anomaly scoring; the live pipeline degrades gracefully when artifacts are missing (rule engine still runs; contextual scores read 0).

```bash
cd backend
# Optional: point the loader at your CSVs (defaults to env-only)
export DATA_REF_CSV=/path/to/env_ref.csv
export DATA_GAS_CSV=/path/to/env_gas.csv
export DATA_POS_CSV=/path/to/positions.csv
export SIM_DATASET_JSON=/path/to/simulator/data/sensors_dataset.json
export SAMPLE_STRIDE=5

python -m ml.prepare_data        # writes data.npy, labels.npy, splits.npy, scaler.pkl, feature_manifest.json
python -m ml.train               # trains IF + LOF, writes model_if.pkl, model_lof.pkl, model.pkl, manifest metrics
python -m scripts.evaluate       # writes evaluation_report.json (full thesis-grade comparison)
python -m scripts.failure_test   # broker outage + recovery measurement (requires `docker compose`)
```

Schema/feature contract is pinned in `backend/ml/feature_schema.py` (`SCHEMA_VERSION="contextual_v1"`). The inference service refuses to score when the manifest version mismatches the code version, so retraining is mandatory whenever the schema changes.
