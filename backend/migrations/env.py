from alembic import context
from app.db import Base
from app import models

connection = context.config.attributes['connection']
context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
with context.begin_transaction():
    context.run_migrations()
