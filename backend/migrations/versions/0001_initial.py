"""Initial canonical book, series and curated list schema."""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('series', sa.Column('id', sa.Integer, primary_key=True), sa.Column('name', sa.String, nullable=False, unique=True), sa.Column('notes', sa.Text))
    op.create_table('books',
        sa.Column('id', sa.Integer, primary_key=True),
        *[sa.Column(n, sa.String, nullable=False) for n in ('author', 'english_title', 'normalized_author', 'normalized_title')],
        *[sa.Column(n, sa.Integer) for n in ('release_year', 'czech_translation_year', 'slovak_translation_year', 'rating')],
        *[sa.Column(n, sa.Boolean, nullable=False, server_default=sa.false()) for n in ('translated_cs', 'translated_sk', 'owned', 'read', 'knihobot_watchlist', 'knihobot_wishlist')],
        sa.Column('czech_title', sa.String), sa.Column('slovak_title', sa.String),
        sa.Column('expected_price', sa.Float), sa.Column('series_position', sa.Float),
        sa.Column('series_id', sa.Integer, sa.ForeignKey('series.id', ondelete='SET NULL')),
        sa.Column('notes', sa.Text), sa.Column('created_at', sa.DateTime(timezone=True), nullable=False), sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('normalized_author', 'normalized_title'),
        sa.CheckConstraint('rating IS NULL OR rating BETWEEN 0 AND 5'), sa.CheckConstraint('expected_price IS NULL OR expected_price >= 0'))
    for column in ('normalized_title', 'series_id', 'owned'):
        op.create_index('ix_books_' + column, 'books', [column])
    op.create_table('curated_lists', sa.Column('id', sa.Integer, primary_key=True), sa.Column('name', sa.String, nullable=False, unique=True), sa.Column('description', sa.Text), sa.Column('source_url', sa.String, unique=True), sa.Column('source_name', sa.String))
    op.create_table('curated_list_entries', sa.Column('id', sa.Integer, primary_key=True), sa.Column('curated_list_id', sa.Integer, sa.ForeignKey('curated_lists.id', ondelete='CASCADE'), nullable=False), sa.Column('book_id', sa.Integer, sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False), sa.Column('rank', sa.Integer), sa.Column('source_title', sa.String), sa.Column('source_author', sa.String), sa.UniqueConstraint('curated_list_id', 'book_id'))
    for column in ('curated_list_id', 'book_id'):
        op.create_index('ix_curated_list_entries_' + column, 'curated_list_entries', [column])


def downgrade():
    for table in ('curated_list_entries', 'curated_lists', 'books', 'series'):
        op.drop_table(table)
