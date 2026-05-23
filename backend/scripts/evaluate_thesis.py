"""Reproduce Chapter 4 F1 metrics (offline injection + live CSV replay).

Usage (from ``backend/`` after ``prepare_data`` + ``train``)::

    python -m scripts.evaluate_thesis
    python -m scripts.evaluate_thesis --stride 1          # slower, denser replay
    python -m scripts.evaluate_thesis --live-csv path.csv

Writes ``ml/thesis_evaluation_report.json`` and updates ``feature_manifest.json``
with a compact ``thesis_metrics`` summary block.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

from ml.thesis_metrics import build_thesis_report, write_thesis_report


logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Chapter 4 thesis metrics evaluation")
    parser.add_argument(
        "--stride",
        type=int,
        default=5,
        help="Row stride for streaming injection replay (default 5)",
    )
    parser.add_argument(
        "--live-csv",
        type=Path,
        default=None,
        help="Optional live session CSV (default: docs/thesis/anomaly_series_*.csv)",
    )
    args = parser.parse_args()

    logger.info("building thesis evaluation report (stride=%d)", args.stride)
    report = build_thesis_report(stride=max(1, args.stride), live_csv=args.live_csv)
    path = write_thesis_report(report)
    print(json.dumps(report, indent=2))
    logger.info("wrote %s", path)


if __name__ == "__main__":
    main()
