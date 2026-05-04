"""telemetry t_sim and threshold motion_light_combo_max

Revision ID: 005
Revises: 004
Create Date: 2026-05-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("telemetry", sa.Column("t_sim", sa.BigInteger(), nullable=True))
    op.add_column(
        "thresholds",
        sa.Column("motion_light_combo_max", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("thresholds", "motion_light_combo_max")
    op.drop_column("telemetry", "t_sim")
