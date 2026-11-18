"""Current outgoing loan information on canonical books."""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('books', sa.Column('borrower', sa.String(500), nullable=True))
    op.add_column('books', sa.Column('loan_date', sa.Date(), nullable=True))
    op.create_table('returned_loans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('event_id', sa.String(36), nullable=False, unique=True),
        sa.Column('book_id', sa.Integer(), sa.ForeignKey('books.id', ondelete='CASCADE'), nullable=False),
        sa.Column('borrower', sa.String(500), nullable=False),
        sa.Column('loan_date', sa.Date(), nullable=False),
        sa.Column('returned_at', sa.DateTime(timezone=True), nullable=False))
    op.create_index('ix_returned_loans_book_id', 'returned_loans', ['book_id'])


def downgrade():
    op.drop_table('returned_loans')
    with op.batch_alter_table('books') as batch:
        batch.drop_column('loan_date')
        batch.drop_column('borrower')
