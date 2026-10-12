"""add_performance_composite_indexes

Revision ID: 7a8e1b2c3d4f
Revises: 4d9c03b5ca37
Create Date: 2026-10-12 05:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7a8e1b2c3d4f'
down_revision: Union[str, None] = '4d9c03b5ca37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # FRANZY #10: High-frequency query composite indexes for per-user dashboard sorting and filtering
    op.create_index('ix_decisions_user_updated', 'decisions', ['user_id', 'updated_at'])
    op.create_index('ix_decisions_user_state', 'decisions', ['user_id', 'state'])
    op.create_index('ix_approvals_user_status_created', 'approval_requests', ['user_id', 'status', 'created_at'])
    op.create_index('ix_audit_events_user_timestamp', 'audit_events', ['user_id', 'timestamp'])
    op.create_index('ix_findings_user_status_created', 'findings', ['user_id', 'status', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_findings_user_status_created', table_name='findings')
    op.drop_index('ix_audit_events_user_timestamp', table_name='audit_events')
    op.drop_index('ix_approvals_user_status_created', table_name='approval_requests')
    op.drop_index('ix_decisions_user_state', table_name='decisions')
    op.drop_index('ix_decisions_user_updated', table_name='decisions')
