"""telemetry received_at

Revision ID: 004
Revises: 003
Create Date: 2026-05-04

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "telemetry",
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_telemetry_received_at"),
        "telemetry",
        ["received_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_telemetry_received_at"), table_name="telemetry")
    op.drop_column("telemetry", "received_at")
