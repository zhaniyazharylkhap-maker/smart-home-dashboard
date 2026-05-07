"""telemetry trace_id uniqueness for idempotency

Revision ID: 006
Revises: 005
Create Date: 2026-05-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("telemetry", sa.Column("trace_id", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_telemetry_trace_id"), "telemetry", ["trace_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_telemetry_trace_id"), table_name="telemetry")
    op.drop_column("telemetry", "trace_id")
