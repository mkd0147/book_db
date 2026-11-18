"""Book page count and reading sessions with day-by-day history."""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('books', sa.Column('page_count', sa.Integer(), nullable=True))
    op.create_table('reading_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.String(36), nullable=False, unique=True),
        sa.Column('book_id', sa.Integer(), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('started_on', sa.Date(), nullable=False),
        sa.Column('ended_on', sa.Date(), nullable=True),
        sa.Column('reading_days', sa.JSON(), nullable=False),
        sa.CheckConstraint("status IN ('active', 'completed', 'stopped')"))
    op.create_index('ix_reading_sessions_book_id', 'reading_sessions', ['book_id'])
    op.create_index('ix_reading_active_book', 'reading_sessions', ['book_id'], unique=True, sqlite_where=sa.text("status = 'active'"))


def downgrade():
    op.drop_table('reading_sessions')
    with op.batch_alter_table('books') as batch:
        batch.drop_column('page_count')
