"""Contextual anomaly inference service.

Used by the live ingestion pipeline and the API layer. The service is a
process-wide singleton: artifacts (`scaler`, `model_if`, `model_lof`,
`feature_manifest`) are loaded once at first use, and a per-device
adaptive threshold is updated from a rolling score deque so the system
gradually adapts to its own baseline.

Every call returns an `InferenceResult` with:
- `score` 0..100 ensemble anomaly score
- `threshold` the adaptive threshold currently in effect
- `is_anomaly` boolean
- `explanations` ordered list of human-readable factor labels
- `feature_contributions` raw per-feature z-score contributions for
  drill-down panels in the dashboard
- `model_version` derived from the manifest (`schema_version` + a hash
  of feature names) so the frontend can flag stale clients
- `degraded` true when artifacts are missing or fail to load: the
  service then returns `score=0`, `is_anomaly=False`, and the rest of
  the platform falls back to the rule engine.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Deque

import joblib
import numpy as np

from ml.feature_builder import RollingStats, build_feature_row
from ml.feature_schema import (
    FEATURE_INDEX,
    FEATURE_LABELS,
    FEATURE_NAMES,
    NUM_FEATURES,
    SCHEMA_VERSION,
)


logger = logging.getLogger(__name__)
ML_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = ML_DIR / "feature_manifest.json"
SCALER_PATH = ML_DIR / "scaler.pkl"
MODEL_IF_PATH = ML_DIR / "model_if.pkl"
MODEL_LOF_PATH = ML_DIR / "model_lof.pkl"
LEGACY_MODEL_PATH = ML_DIR / "model.pkl"

# Per-device window of recent ensemble scores used to derive an adaptive
# threshold. Small enough to react within minutes; large enough not to
# track every transient.
_DEVICE_SCORE_WINDOW = 200
_MIN_SCORES_FOR_ADAPTIVE = 60
_ADAPTIVE_QUANTILE = 0.95


@dataclass(frozen=True)
class InferenceResult:
    score: float
    threshold: float
    is_anomaly: bool
    explanations: list[str]
    feature_contributions: list[tuple[str, float]]
    model_version: str
    degraded: bool


@dataclass
class _Artifacts:
    scaler: object | None = None
    model_if: object | None = None
    model_lof: object | None = None
    if_lo: float = 0.0
    if_hi: float = 1.0
    lof_lo: float = 0.0
    lof_hi: float = 1.0
    w_if: float = 0.5
    w_lof: float = 0.5
    default_threshold: float = 50.0
    feature_means: np.ndarray = field(default_factory=lambda: np.zeros(NUM_FEATURES))
    feature_stds: np.ndarray = field(default_factory=lambda: np.ones(NUM_FEATURES))
    schema_version: str = SCHEMA_VERSION
    model_version: str = "unloaded"


class ContextualInferenceService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._artifacts: _Artifacts | None = None
        self._device_scores: dict[str, Deque[float]] = {}

    # --- artifact loading -------------------------------------------------
    def _load(self) -> _Artifacts:
        if not MANIFEST_PATH.exists() or not SCALER_PATH.exists():
            raise FileNotFoundError(
                "Inference artifacts missing; run prepare_data.py and train.py."
            )
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if manifest.get("schema_version") != SCHEMA_VERSION:
            raise RuntimeError(
                f"manifest schema {manifest.get('schema_version')} != code {SCHEMA_VERSION}"
            )
        if list(manifest.get("feature_names") or []) != list(FEATURE_NAMES):
            raise RuntimeError(
                "feature names in manifest do not match current FEATURE_NAMES"
            )

        scaler = joblib.load(SCALER_PATH)
        if MODEL_IF_PATH.exists():
            model_if = joblib.load(MODEL_IF_PATH)
        elif LEGACY_MODEL_PATH.exists():
            # Older training runs saved only `model.pkl` for the IF model.
            model_if = joblib.load(LEGACY_MODEL_PATH)
        else:
            raise FileNotFoundError(f"missing {MODEL_IF_PATH.name}")
        model_lof = joblib.load(MODEL_LOF_PATH) if MODEL_LOF_PATH.exists() else None

        ens = manifest.get("ensemble") or {}
        ranges = ens.get("score_ranges") or {}
        if_range = ranges.get("isolation_forest") or {}
        lof_range = ranges.get("lof") or {}
        weights = ens.get("weights") or {}

        means = getattr(scaler, "mean_", np.zeros(NUM_FEATURES))
        stds = getattr(scaler, "scale_", np.ones(NUM_FEATURES))
        means = np.asarray(means, dtype=np.float64)
        stds = np.asarray(stds, dtype=np.float64)
        # Avoid div-by-zero for constant features.
        stds = np.where(stds < 1e-9, 1.0, stds)

        digest = hashlib.sha1(
            (
                json.dumps(
                    {
                        "schema": SCHEMA_VERSION,
                        "features": list(FEATURE_NAMES),
                        "rows_train": int(manifest.get("rows_train") or 0),
                        "threshold": float(ens.get("default_threshold") or 0.0),
                    }
                )
            ).encode("utf-8")
        ).hexdigest()[:10]

        return _Artifacts(
            scaler=scaler,
            model_if=model_if,
            model_lof=model_lof,
            if_lo=float(if_range.get("lo", 0.0)),
            if_hi=float(if_range.get("hi", 1.0)),
            lof_lo=float(lof_range.get("lo", 0.0)),
            lof_hi=float(lof_range.get("hi", 1.0)),
            w_if=float(weights.get("isolation_forest", 0.5)),
            w_lof=float(weights.get("lof", 0.5)),
            default_threshold=float(ens.get("default_threshold", 50.0)),
            feature_means=means,
            feature_stds=stds,
            schema_version=SCHEMA_VERSION,
            model_version=f"{SCHEMA_VERSION}-{digest}",
        )

    def _get_artifacts(self) -> _Artifacts | None:
        if self._artifacts is not None:
            return self._artifacts
        with self._lock:
            if self._artifacts is not None:
                return self._artifacts
            try:
                self._artifacts = self._load()
                logger.info(
                    "contextual inference artifacts loaded version=%s",
                    self._artifacts.model_version,
                )
            except Exception:  # noqa: BLE001
                logger.exception("failed to load contextual artifacts; degraded mode")
                return None
            return self._artifacts

    def reload(self) -> bool:
        """Force-reload artifacts (used after retraining)."""
        with self._lock:
            try:
                self._artifacts = self._load()
                self._device_scores.clear()
                return True
            except Exception:  # noqa: BLE001
                logger.exception("artifact reload failed")
                self._artifacts = None
                return False

    # --- scoring ---------------------------------------------------------
    def _normalize_if(self, art: _Artifacts, raw: float) -> float:
        rng = art.if_hi - art.if_lo
        if rng <= 1e-12:
            return 0.0
        inv = (art.if_hi - raw) / rng
        return float(np.clip(inv * 100.0, 0.0, 100.0))

    def _normalize_lof(self, art: _Artifacts, raw: float) -> float:
        rng = art.lof_hi - art.lof_lo
        if rng <= 1e-12:
            return 0.0
        inv = (art.lof_hi - raw) / rng
        return float(np.clip(inv * 100.0, 0.0, 100.0))

    def _adaptive_threshold(self, art: _Artifacts, device_id: str) -> float:
        scores = self._device_scores.get(device_id)
        if not scores or len(scores) < _MIN_SCORES_FOR_ADAPTIVE:
            return art.default_threshold
        # Per-device 95th percentile of recent scores -- gracefully
        # tightens for quiet devices and loosens for noisy ones.
        return float(np.quantile(np.asarray(scores), _ADAPTIVE_QUANTILE))

    def _push_score(self, device_id: str, score: float) -> None:
        dq = self._device_scores.get(device_id)
        if dq is None:
            dq = deque(maxlen=_DEVICE_SCORE_WINDOW)
            self._device_scores[device_id] = dq
        dq.append(score)

    def _explain(
        self, art: _Artifacts, raw_row: list[float], score: float
    ) -> tuple[list[str], list[tuple[str, float]]]:
        """Return top-3 explanation tokens + raw per-feature contributions.

        Contribution = absolute z-score of the feature relative to the
        train-set distribution. We rank features by |z| and project the
        top three onto human-readable labels.
        """
        x = np.asarray(raw_row, dtype=np.float64)
        z = (x - art.feature_means) / art.feature_stds
        contribs: list[tuple[str, float]] = []
        for name in FEATURE_NAMES:
            idx = FEATURE_INDEX[name]
            contribs.append((name, float(z[idx])))
        contribs_sorted = sorted(contribs, key=lambda kv: abs(kv[1]), reverse=True)
        top3 = contribs_sorted[:3]
        labels: list[str] = []
        seen: set[str] = set()
        for name, _ in top3:
            label = FEATURE_LABELS.get(name, name)
            if label in seen:
                continue
            seen.add(label)
            labels.append(label)
        # If the score is small but a deterministic residual triggered,
        # surface that explicitly so the user understands the signal.
        gas_no_occ_idx = FEATURE_INDEX["gas_no_occupancy"]
        motion_night_idx = FEATURE_INDEX["motion_at_night"]
        if x[gas_no_occ_idx] > 1e-3 and "Gas elevated without occupancy" not in labels:
            labels.insert(0, "Gas elevated without occupancy")
        if x[motion_night_idx] > 0.5 and "Motion detected at night" not in labels:
            labels.insert(0, "Motion detected at night")
        if score < 1.0 and not labels:
            labels.append("No notable deviation")
        return labels[:5], contribs_sorted[:8]

    def score_event(
        self,
        *,
        device_id: str,
        timestamp,
        temperature: float | None,
        humidity: float | None,
        gas: float | None,
        smoke: float | None,
        light: float | None,
        motion: bool | None,
        occupancy_total: float | None,
        room: str | None,
        rolling: RollingStats | None = None,
    ) -> InferenceResult:
        art = self._get_artifacts()
        if art is None:
            return InferenceResult(
                score=0.0,
                threshold=50.0,
                is_anomaly=False,
                explanations=["Model artifacts unavailable"],
                feature_contributions=[],
                model_version="degraded",
                degraded=True,
            )

        raw_row = build_feature_row(
            timestamp=timestamp,
            temperature=temperature,
            humidity=humidity,
            gas=gas,
            smoke=smoke,
            light=light,
            motion=motion,
            occupancy_total=occupancy_total,
            room=room,
            rolling=rolling,
        )
        x = np.asarray(raw_row, dtype=np.float64).reshape(1, -1)
        try:
            assert art.scaler is not None
            x_scaled = art.scaler.transform(x)  # type: ignore[union-attr]
            assert art.model_if is not None
            if_raw = float(
                art.model_if.decision_function(x_scaled)[0]  # type: ignore[union-attr]
            )
            if art.model_lof is not None:
                lof_raw = float(
                    art.model_lof.decision_function(x_scaled)[0]  # type: ignore[union-attr]
                )
                score = (
                    art.w_if * self._normalize_if(art, if_raw)
                    + art.w_lof * self._normalize_lof(art, lof_raw)
                )
            else:
                score = self._normalize_if(art, if_raw)
        except Exception:  # noqa: BLE001
            logger.exception("inference scoring failed for device=%s", device_id)
            return InferenceResult(
                score=0.0,
                threshold=art.default_threshold,
                is_anomaly=False,
                explanations=["Inference error"],
                feature_contributions=[],
                model_version=art.model_version,
                degraded=True,
            )

        with self._lock:
            self._push_score(device_id, score)
            threshold = self._adaptive_threshold(art, device_id)
        explanations, contribs = self._explain(art, raw_row, score)
        return InferenceResult(
            score=round(float(score), 3),
            threshold=round(float(threshold), 3),
            is_anomaly=bool(score >= threshold),
            explanations=explanations,
            feature_contributions=contribs,
            model_version=art.model_version,
            degraded=False,
        )


# Process-wide singleton.
contextual_inference = ContextualInferenceService()


__all__ = ["ContextualInferenceService", "InferenceResult", "contextual_inference"]
