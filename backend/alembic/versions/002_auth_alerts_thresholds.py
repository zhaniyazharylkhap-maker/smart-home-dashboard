"""users alerts thresholds

Revision ID: 002
Revises: 001
Create Date: 2026-03-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# bcrypt hash for password Demo123!
DEMO_HASH = (
    "$2b$12$Amrs61EHC3zIzV/GdOC6EOlm4ZSrlCd8NDa/VN/Pe3HkgfRcuq2TS"
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "thresholds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("temperature_max", sa.Float(), nullable=True),
        sa.Column("gas_max", sa.Float(), nullable=True),
        sa.Column("smoke_max", sa.Float(), nullable=True),
        sa.Column("humidity_min", sa.Float(), nullable=True),
        sa.Column("humidity_max", sa.Float(), nullable=True),
        sa.Column("offline_after_minutes", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_thresholds_room_id"), "thresholds", ["room_id"], unique=False)

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alerts_alert_type"), "alerts", ["alert_type"], unique=False)
    op.create_index(op.f("ix_alerts_created_at"), "alerts", ["created_at"], unique=False)
    op.create_index(op.f("ix_alerts_device_id"), "alerts", ["device_id"], unique=False)
    op.create_index(op.f("ix_alerts_room_id"), "alerts", ["room_id"], unique=False)
    op.create_index(op.f("ix_alerts_severity"), "alerts", ["severity"], unique=False)
    op.create_index(op.f("ix_alerts_status"), "alerts", ["status"], unique=False)

    conn = op.get_bind()
    conn.execute(
        text(
            """
            INSERT INTO users (name, email, password_hash)
            SELECT :name, :email, :password_hash
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = :email)
            """
        ),
        {"name": "Demo User", "email": "demo@nexus.local", "password_hash": DEMO_HASH},
    )

    conn.execute(
        text(
            """
            INSERT INTO thresholds (
                room_id, temperature_max, gas_max, smoke_max,
                humidity_min, humidity_max, offline_after_minutes
            )
            SELECT NULL, 30.0, 0.5, 0.25, 30.0, 70.0, 10
            WHERE NOT EXISTS (SELECT 1 FROM thresholds WHERE room_id IS NULL)
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_alerts_status"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_severity"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_room_id"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_device_id"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_created_at"), table_name="alerts")
    op.drop_index(op.f("ix_alerts_alert_type"), table_name="alerts")
    op.drop_table("alerts")
    op.drop_index(op.f("ix_thresholds_room_id"), table_name="thresholds")
    op.drop_table("thresholds")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
