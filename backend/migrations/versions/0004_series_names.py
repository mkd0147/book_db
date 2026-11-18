"""Optional Czech and Slovak names for canonical series."""
from alembic import op
import sqlalchemy as sa
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('series', sa.Column('czech_name',sa.String))
    op.add_column('series', sa.Column('slovak_name',sa.String))

def downgrade():
    with op.batch_alter_table('series') as batch:
        batch.drop_column('slovak_name')
        batch.drop_column('czech_name')
