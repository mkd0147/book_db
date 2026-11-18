from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from app.db import make_engine, migrate
from app.main import create_app


def test_migration_repeated_startup_preserves_data(tmp_path):
    path = tmp_path / 'migration.db'
    engine = make_engine(path)
    migrate(engine)
    with engine.connect() as connection:
        assert connection.scalar(text('select version_num from alembic_version')) == '0008'
        assert connection.scalar(text('PRAGMA foreign_keys')) == 1
    assert set(inspect(engine).get_table_names()) == {'books', 'series', 'curated_lists', 'curated_list_entries', 'curated_series_entries', 'returned_loans', 'reading_sessions', 'alembic_version'}
    engine.dispose()
    with TestClient(create_app(path)) as client:
        client.post('/api/books', json={'author': 'A', 'english_title': 'Persisted', 'owned': True})
    with TestClient(create_app(path)) as client:
        assert client.get('/api/books').json()['items'][0]['owned']


def test_upgrade_existing_library_keeps_translation_and_collection(tmp_path):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    path = tmp_path / 'existing.db'
    engine = make_engine(path)
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0001')
        connection.execute(text("INSERT INTO books (id,author,english_title,normalized_author,normalized_title,owned,read,translated_sk,rating,created_at,updated_at) VALUES (42,'Author','Title','author','title',1,1,1,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
    engine.dispose()
    with TestClient(create_app(path)) as client:
        book = client.get('/api/books/42').json()
        assert book['owned'] and book['read'] and book['translated_sk']
        assert book['rating'] == 5 and book['translated_cs_sk'] is False
        assert client.get('/api/books?translated=true').json()['total'] == 1


def test_upgrade_preserves_existing_reading_sessions(tmp_path):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    engine = make_engine(tmp_path / 'reading-upgrade.db')
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0007')
        connection.execute(text("INSERT INTO books (id,author,english_title,normalized_author,normalized_title,owned,read,rating,created_at,updated_at) VALUES (42,'Author','Title','author','title',1,1,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
        connection.execute(text("INSERT INTO reading_sessions (id,event_id,book_id,status,started_on,reading_days) VALUES (1,'existing',42,'active','2026-01-01','[\"2026-01-01\"]')"))
    migrate(engine)
    with engine.connect() as connection:
        row = connection.execute(text('SELECT event_id,started_on,reading_days FROM reading_sessions')).one()
        assert tuple(row) == ('existing','2026-01-01','["2026-01-01"]')
        assert any(index['name'] == 'ix_reading_active_book' and index['unique'] for index in inspect(connection).get_indexes('reading_sessions'))
    engine.dispose()
