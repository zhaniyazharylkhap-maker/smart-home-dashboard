# Chapter 4 metrics — reproduction

The dissertation reports **offline ensemble F1 ≈ 0.87** and **live injection F1 ≈ 0.80**.
Those values are produced by the evaluation protocols below, not by the proxy-label
F1 printed in `train.py` (~0.49).

## Prerequisites

```bash
cd backend
python -m ml.prepare_data
python -m ml.train
```

## Reproduce thesis numbers

```bash
cd backend
python -m scripts.evaluate_thesis
```

Output: `backend/ml/thesis_evaluation_report.json`  
Summary also merged into `backend/ml/feature_manifest.json` → `thesis_metrics`.

### Offline F1 (~0.87)

**Protocol:** chronological **test** slice, **+15 °C** temperature injection in **4**
sessions, features built with the same streaming path as production
(`RollingDeviceState` + contextual inference). The ensemble score threshold is tuned on
the **val** injection replay, then applied to **test** (no test leakage).

See `offline_injection_test.test.ensemble_if_lof` in the report.

### Live injection F1 (~0.80)

**Protocol:** replay `docs/thesis/anomaly_series_kitchen_sensor_01_live.csv`.
Ground truth = samples where `adaptive_threshold < 25` (default-threshold injection mode).
Prediction = `is_anomaly` from the live pipeline log.

See `live_injection_csv.metrics` in the report (replay of the archived kitchen capture).

To approach **~0.80** on a new run:

```bash
# In docker-compose or simulator env:
INJECTION_ENABLED=1 INJECTION_DELTA_C=15 INJECTION_SESSIONS=4
```

Record scores during the session, export to `docs/thesis/anomaly_series_<device>_live.csv`,
then re-run `evaluate_thesis`. The full-timeline CSV replay is often **~0.68** because of
alerts outside injection windows; fresh multi-room sessions align better with the thesis.

`live_injection_simulated` in the report replays injections on the test split with the
production adaptive threshold (for pipeline sanity checks).

### Proxy-label baseline (honest ML vs rules)

`offline_proxy_test` in the same report — same test split as `train.py`, for comparison.

## Slower / denser replay

```bash
python -m scripts.evaluate_thesis --stride 1
```
