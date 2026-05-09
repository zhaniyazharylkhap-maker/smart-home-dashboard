"""rename seeded demo user email to admin@livesense.com

Fresh databases created after 002 was updated seed admin@livesense.com
directly; this migration upgrades rows still using the legacy
demo@nexus.local address (from older 002 revisions).

Revision ID: 009
Revises: 008
Create Date: 2026-05-09
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_EMAIL = "admin@livesense.com"
OLD_EMAIL = "demo@nexus.local"


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE users
            SET email = :new_email, name = 'Admin'
            WHERE email = :old_email
            """
        ),
        {"new_email": NEW_EMAIL, "old_email": OLD_EMAIL},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        text(
            """
            UPDATE users
            SET email = :old_email, name = 'Demo User'
            WHERE email = :new_email
            """
        ),
        {"new_email": NEW_EMAIL, "old_email": OLD_EMAIL},
    )
