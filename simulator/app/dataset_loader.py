from __future__ import annotations

import csv
from collections.abc import Iterator
from pathlib import Path


def locate_dataset(path_hint: str) -> Path:
    p = Path(path_hint)
    if p.exists():
        return p
    # resolve relative to simulator root
    local = Path(__file__).resolve().parents[1] / path_hint
    if local.exists():
        return local
    raise FileNotFoundError(f"Dataset not found: {path_hint}")


def iter_rows(csv_path: Path) -> Iterator[dict[str, str]]:
    """Yield CSV rows forever (replay loop)."""
    while True:
        with csv_path.open(newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                yield row


def inspect_dataset(csv_path: Path, sample_size: int = 5) -> tuple[list[str], list[dict[str, str]]]:
    with csv_path.open(newline="") as f:
        reader = csv.DictReader(f)
        cols = reader.fieldnames or []
        sample: list[dict[str, str]] = []
        for i, row in enumerate(reader):
            if i >= sample_size:
                break
            sample.append(row)
    return cols, sample
