"""add alert risk fields

Revision ID: 003
Revises: 002
Create Date: 2026-03-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("alerts", sa.Column("risk_score", sa.Float(), nullable=True))
    op.add_column("alerts", sa.Column("risk_level", sa.String(length=16), nullable=True))
    op.add_column("alerts", sa.Column("alert_reasons", sa.Text(), nullable=True))
    op.create_index(op.f("ix_alerts_risk_level"), "alerts", ["risk_level"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_alerts_risk_level"), table_name="alerts")
    op.drop_column("alerts", "alert_reasons")
    op.drop_column("alerts", "risk_level")
    op.drop_column("alerts", "risk_score")
