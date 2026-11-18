"""Allow queued reading sessions without a start date."""
from alembic import op
import sqlalchemy as sa
revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('reading_sessions') as batch:
        batch.alter_column('started_on', existing_type=sa.Date(), nullable=True)


def downgrade():
    op.execute("UPDATE reading_sessions SET started_on = COALESCE((SELECT MIN(value) FROM json_each(reading_days)), date('now')) WHERE started_on IS NULL")
    with op.batch_alter_table('reading_sessions') as batch:
        batch.alter_column('started_on', existing_type=sa.Date(), nullable=False)
