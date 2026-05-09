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
4. Open **http://localhost:3000/login** — seeded admin **`admin@livesense.com` / `Demo123!`** (see SETUP). The UI talks to the API at **http://127.0.0.1:8000**; live tiles need **Redis** (included in compose).
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

## Frontend (dark analytics console)

The frontend is a unified dark analytics workspace styled in the spirit of Grafana / Datadog. It has five top-level routes under the authenticated shell:

| Route        | What it shows                                                                                                  |
|--------------|----------------------------------------------------------------------------------------------------------------|
| `/dashboard` | Hero KPI row, **Live Anomaly Score** panel, telemetry grid, humanized alert feed, **Operational Metrics** panel |
| `/telemetry` | Multi-metric chart with **threshold bands** + adaptive line, sparkline strip, behavioral heatmap & correlations |
| `/anomaly`   | Per-device drill-down with **anomaly score history** chart, learned-normal envelope and contextual explanations |
| `/alerts`    | Active + resolved incidents with humanized `alert_reasons` and `recommended_action`                            |
| `/devices`   | Sensor catalog with online/offline status                                                                      |

Key shared components live under `frontend/components/analytics/`:

- `live-anomaly-score-card.tsx` — current adaptive score, threshold, trend, confidence.
- `explanation-card.tsx` — humanizes `explanation_tokens` into readable narratives.
- `learned-normal-card.tsx` — P10/P50/P90 envelope vs current reading per hour-of-day.
- `correlation-insights.tsx` — sentence list + matrix toggle for cross-sensor relationships.
- `behavioral-heatmap.tsx` — anomaly score by room × hour with anomaly density overlay.
- `threshold-band-chart.tsx` — Recharts wrapper rendering normal / warning / anomaly zones.
- `operational-metrics-panel.tsx` + `system-health-strip.tsx` — websocket latency (avg / p95 / max), throughput, message loss, reconnect count, degraded inference mode.

Token humanizer lives in `frontend/lib/explanations.ts`. It maps backend feature labels and risk-engine reasons to operator-facing copy and composes one-line narratives such as *"Kitchen: Gas elevated without occupancy."*.

### Frontend roadmap (Part 6 proposals)

Implemented in this pass:

- **Anomaly Workspace** — per-device drill-down using `/anomaly/history`.
- **Humanized explanation card** — token-to-sentence mapper.
- **Cross-sensor relationship insights** — natural-language replacement for the raw correlation matrix.
- **System health strip + operational metrics panel** — degraded-mode and reconnect-count visibility.

Proposed and grounded in existing backend data (no schema changes required):

- *Occupancy timeline overlay* — overlay motion + light onto anomaly chart to visualize occupancy-aware reasoning. Backend already exposes both fields per reading.
- *Predictive behavior indicator* — render a faint forward band on the dashboard chart from the next-hour `/anomaly/profile` envelope.
- *Room intelligence view* — group anomalies by `room` and rank rooms by anomaly density per day.
- *Historical comparison tool* — diff the current 24h envelope vs the previous 24h by re-querying `/anomaly/profile` twice.
