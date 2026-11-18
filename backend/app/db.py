import os
import unicodedata
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase


def normalize(value):
    return ' '.join(unicodedata.normalize('NFKC', value or '').casefold().split())


def search_normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', normalize(value)) if not unicodedata.combining(c))


class Base(DeclarativeBase):
    pass


def database_path():
    from .storage import ensure_separate, legacy_root, copy_legacy_once
    override = os.environ.get('BOOK_DB_DATA_DIR')
    root = ensure_separate(Path(override) if override else legacy_root().with_name('BookDB-1.9'))
    root.mkdir(parents=True, exist_ok=True)
    path = root / 'books.db'
    if not override:
        copy_legacy_once(path, legacy_root() / 'books.db')
    return path


def make_engine(path):
    from .storage import ensure_separate
    path = ensure_separate(path)
    engine = create_engine('sqlite:///' + str(path), connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def configure(connection, _):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=5000')
        connection.create_function('search_normalize', 1, search_normalize, deterministic=True)

    return engine


def migrate(engine):
    from alembic import command
    from alembic.config import Config
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, 'head')
