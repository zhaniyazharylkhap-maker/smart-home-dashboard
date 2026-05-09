"""user scoping on rooms/devices/alerts

Adds nullable user_id FKs so existing single-tenant data keeps working,
backfills all pre-existing rows to the seeded admin account, and indexes the
new column for the per-user list queries.

Kept nullable on purpose: the column is logically required at the
application layer (routes assign current_user.id on writes; ingestion
assigns MQTT_DEFAULT_OWNER_USER_ID), but a NOT NULL constraint would
require a single migration window with no in-flight writes. Nullable
plus application-side enforcement is the standard incremental-rollout
pattern.

Revision ID: 007
Revises: 006
Create Date: 2026-05-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("rooms", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_rooms_user_id", "rooms", "users", ["user_id"], ["id"]
    )
    op.create_index(op.f("ix_rooms_user_id"), "rooms", ["user_id"], unique=False)

    op.add_column("devices", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_devices_user_id", "devices", "users", ["user_id"], ["id"]
    )
    op.create_index(op.f("ix_devices_user_id"), "devices", ["user_id"], unique=False)

    op.add_column("alerts", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_alerts_user_id", "alerts", "users", ["user_id"], ["id"]
    )
    op.create_index(op.f("ix_alerts_user_id"), "alerts", ["user_id"], unique=False)

    # Backfill pre-existing rows to the seeded admin account (created in 002).
    # Skipped silently if the seeded user is absent (e.g. test fixtures).
    conn = op.get_bind()
    demo_user_id = conn.execute(
        text("SELECT id FROM users WHERE email = 'admin@livesense.com' LIMIT 1")
    ).scalar()
    if demo_user_id is not None:
        conn.execute(
            text("UPDATE rooms SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": int(demo_user_id)},
        )
        conn.execute(
            text("UPDATE devices SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": int(demo_user_id)},
        )
        conn.execute(
            text("UPDATE alerts SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": int(demo_user_id)},
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_alerts_user_id"), table_name="alerts")
    op.drop_constraint("fk_alerts_user_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "user_id")

    op.drop_index(op.f("ix_devices_user_id"), table_name="devices")
    op.drop_constraint("fk_devices_user_id", "devices", type_="foreignkey")
    op.drop_column("devices", "user_id")

    op.drop_index(op.f("ix_rooms_user_id"), table_name="rooms")
    op.drop_constraint("fk_rooms_user_id", "rooms", type_="foreignkey")
    op.drop_column("rooms", "user_id")
