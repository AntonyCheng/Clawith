"""Use Beijing as the required default tenant timezone.

Revision ID: default_tenant_timezone
Revises: allow_checkpoint_deliveries
Create Date: 2026-08-05 12:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "default_tenant_timezone"
down_revision: str | None = "allow_checkpoint_deliveries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE tenants SET timezone = 'Asia/Shanghai' "
        "WHERE timezone IS NULL OR btrim(timezone) = ''"
    )
    op.alter_column(
        "tenants",
        "timezone",
        existing_type=sa.String(length=50),
        nullable=False,
        server_default="Asia/Shanghai",
    )


def downgrade() -> None:
    op.alter_column(
        "tenants",
        "timezone",
        existing_type=sa.String(length=50),
        nullable=True,
        server_default="UTC",
    )
