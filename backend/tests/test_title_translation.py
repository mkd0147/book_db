from pathlib import Path

import yaml
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db import make_engine
from app.main import create_app


def test_titles_mark_language_on_create_edit_and_backup_import(client):
    book = client.post('/api/books', json={
        'author': 'Author', 'english_title': 'Book', 'czech_title': ' Czech title ',
    }).json()
    assert book['translated_cs'] and not book['translated_sk']
    path = f"/api/books/{book['id']}"
    book = client.patch(path, json={'slovak_title': 'Slovak title', 'translated_sk': False}).json()
    assert book['translated_cs'] and book['translated_sk']
    assert client.get('/api/books?translated=true').json()['total'] == 1
    assert client.get('/api/statistics').json()['translated'] == 1
    book = client.patch(path, json={'czech_title': None, 'slovak_title': '  '}).json()
    assert book['translated_cs'] and book['translated_sk']
    book = client.patch(path, json={'translated_cs': False, 'translated_sk': False}).json()
    assert not book['translated_cs'] and not book['translated_sk']
    backup = {'schema_version': 4, 'books': [{
        'id': 50, 'author': 'Backup author', 'english_title': 'Backup title',
        'slovak_title': 'Local name', 'translated_sk': False,
    }]}
    response = client.post('/api/backup/import', content=yaml.safe_dump(backup))
    assert response.status_code == 200, response.text
    imported = client.get('/api/books?q=Backup').json()['items'][0]
    assert imported['translated_sk'] and not imported['translated_cs']


def test_existing_titles_are_backfilled_without_marking_whitespace(tmp_path):
    path = tmp_path / 'previous.db'
    engine = make_engine(path)
    config = Config()
    config.set_main_option('script_location', str(Path(__file__).resolve().parents[1] / 'migrations'))
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0004')
        connection.execute(text("INSERT INTO books (id, author, english_title, normalized_author, normalized_title, czech_title, slovak_title, created_at, updated_at) VALUES (1, 'A', 'B', 'a', 'b', 'Local title', :blank, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"), {'blank': ' \t\n '})
    engine.dispose()
    with TestClient(create_app(path)) as client:
        book = client.get('/api/books/1').json()
        assert book['translated_cs'] and not book['translated_sk']
