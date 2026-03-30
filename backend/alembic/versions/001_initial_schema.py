"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rooms_name"), "rooms", ["name"], unique=True)

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("device_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_devices_device_id"), "devices", ["device_id"], unique=True)
    op.create_index(op.f("ix_devices_room_id"), "devices", ["room_id"], unique=False)

    op.create_table(
        "telemetry",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("humidity", sa.Float(), nullable=True),
        sa.Column("motion", sa.Boolean(), nullable=True),
        sa.Column("light", sa.Float(), nullable=True),
        sa.Column("gas", sa.Float(), nullable=True),
        sa.Column("smoke", sa.Float(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_telemetry_device_id"), "telemetry", ["device_id"], unique=False)
    op.create_index(op.f("ix_telemetry_room_id"), "telemetry", ["room_id"], unique=False)
    op.create_index(op.f("ix_telemetry_timestamp"), "telemetry", ["timestamp"], unique=False)

    rooms = [
        ("kitchen", "kitchen"),
        ("bedroom", "bedroom"),
        ("living_room", "living"),
        ("bathroom", "bathroom"),
        ("hallway", "hallway"),
    ]
    conn = op.get_bind()
    for name, rtype in rooms:
        conn.execute(
            sa.text(
                """
                INSERT INTO rooms (name, type)
                SELECT :name, :type
                WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE name = :name)
                """
            ),
            {"name": name, "type": rtype},
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_telemetry_timestamp"), table_name="telemetry")
    op.drop_index(op.f("ix_telemetry_room_id"), table_name="telemetry")
    op.drop_index(op.f("ix_telemetry_device_id"), table_name="telemetry")
    op.drop_table("telemetry")
    op.drop_index(op.f("ix_devices_room_id"), table_name="devices")
    op.drop_index(op.f("ix_devices_device_id"), table_name="devices")
    op.drop_table("devices")
    op.drop_index(op.f("ix_rooms_name"), table_name="rooms")
    op.drop_table("rooms")
