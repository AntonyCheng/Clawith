"""Add Feishu group delivery targets to schedules and triggers.

Revision ID: f065_feishu_group_target
Revises: f064_tool_call_tenants
Create Date: 2026-08-18 16:00:00

Idempotence:
  Fresh installs create the target shape from current ORM metadata
  (001_initial_schema runs Base.metadata.create_all) before Alembic
  replays this revision, so the columns may already exist. Inspecting
  the live schema keeps that replay idempotent while preserving the
  legacy upgrade path — same pattern as f061_enterprise_info_tenant_id.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f065_feishu_group_target"
down_revision: str | Sequence[str] | None = "f064_tool_call_tenants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_COLUMNS = (
    ("agent_schedules", "delivery_target_id"),
    ("agent_triggers", "delivery_target_id"),
)


def _existing_columns(table_name: str) -> set[str]:
    """Return the column names currently present on the table."""
    try:
        inspector = sa.inspect(op.get_bind())
    except sa.exc.NoInspectionAvailable:
        return set()
    if not inspector.has_table(table_name):
        return set()
    return {str(column["name"]) for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    for table_name, column_name in _COLUMNS:
        if column_name in _existing_columns(table_name):
            continue
        op.add_column(
            table_name,
            sa.Column(column_name, postgresql.UUID(as_uuid=True), nullable=True),
        )


def downgrade() -> None:
    for table_name, column_name in _COLUMNS:
        if column_name not in _existing_columns(table_name):
            continue
        op.drop_column(table_name, column_name)
