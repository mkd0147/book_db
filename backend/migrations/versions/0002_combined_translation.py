"""Allow known CZ/SK availability without inventing a specific language."""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('books', sa.Column('translated_cs_sk', sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade():
    with op.batch_alter_table('books') as batch:
        batch.drop_column('translated_cs_sk')
