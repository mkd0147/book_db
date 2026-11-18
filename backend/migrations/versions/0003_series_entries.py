"""Curated lists may rank a series as one entry."""
from alembic import op
import sqlalchemy as sa
revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('series', sa.Column('original_author', sa.String))
    op.create_table('curated_series_entries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('curated_list_id', sa.Integer, sa.ForeignKey('curated_lists.id', ondelete='CASCADE'), nullable=False),
        sa.Column('series_id', sa.Integer, sa.ForeignKey('series.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rank', sa.Integer), sa.Column('source_title', sa.String), sa.Column('source_author', sa.String),
        sa.UniqueConstraint('curated_list_id','series_id'))
    for column in ('curated_list_id','series_id'):
        op.create_index('ix_curated_series_entries_'+column,'curated_series_entries',[column])

def downgrade():
    op.drop_table('curated_series_entries')
    with op.batch_alter_table('series') as batch:
        batch.drop_column('original_author')
