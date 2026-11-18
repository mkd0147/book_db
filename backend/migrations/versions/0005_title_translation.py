"""Mark translations known for books with existing localized titles."""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    for title, flag in [('czech_title', 'translated_cs'), ('slovak_title', 'translated_sk')]:
        rows = connection.execute(sa.text(f'SELECT id, {title} FROM books WHERE {title} IS NOT NULL')).all()
        ids = [{'id': row[0]} for row in rows if row[1].strip()]
        if ids:
            connection.execute(sa.text(f'UPDATE books SET {flag} = 1 WHERE id = :id'), ids)


def downgrade():
    # Translation knowledge cannot be distinguished from previously manual flags.
    pass
