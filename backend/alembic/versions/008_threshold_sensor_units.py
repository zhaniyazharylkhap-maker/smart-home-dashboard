"""rescale gas/smoke alert thresholds to MOX/CO sensor units

Background
----------
Migration 002 seeded the global threshold row with `gas_max=0.5` and
`smoke_max=0.25`, which assumed a ppm-fraction unit. The simulator and
the training CSVs both publish gas/smoke on the MOX/CO sensor scale
(gas ~50-300, smoke ~50-700), which made every live event trip the
rule engine.

This migration aligns the seeded global thresholds with the operating
point used by the contextual ML pipeline (train-slice p99 quantiles
captured in `feature_manifest.json#raw_thresholds`):

- gas_max:   0.5  -> 200.0
- smoke_max: 0.25 -> 250.0

Per-room overrides are NOT touched -- operators may have tuned them
intentionally; this migration only rescales the global row.

Revision ID: 008
Revises: 007
Create Date: 2026-05-08
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # Only rescale rows that still carry the original 002 defaults; rows
    # with values < 1.0 are unambiguously the legacy ppm-fraction scale,
    # so this is safe even on environments where operators tweaked one
    # field but not the other.
    conn.execute(
        text(
            """
            UPDATE thresholds
            SET gas_max = 200.0
            WHERE room_id IS NULL
              AND gas_max IS NOT NULL
              AND gas_max < 1.0
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE thresholds
            SET smoke_max = 250.0
            WHERE room_id IS NULL
              AND smoke_max IS NOT NULL
              AND smoke_max < 1.0
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE thresholds
            SET gas_max = 0.5
            WHERE room_id IS NULL AND gas_max = 200.0
            """
        )
    )
    conn.execute(
        text(
            """
            UPDATE thresholds
            SET smoke_max = 0.25
            WHERE room_id IS NULL AND smoke_max = 250.0
            """
        )
    )
